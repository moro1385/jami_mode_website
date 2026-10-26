import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/integrations/supabase/types';
import type { AdminProduct } from './domain/adminProducts';
import { validateImageUploadBatch } from './domain/productImageUploads';
import { createProductImageUploadService, type ProductImageUploadReport } from './application/productImageUploadService';
import { createSupabaseProductBatchImageStorage, createSupabaseProductImageUploadRepository } from './infrastructure/supabaseProductImageUploads';
import { ProductImageUploadControls } from './presentation/ProductImageUploadControls';
import { useAdminProducts } from './presentation/useAdminProducts';
import { adminProducts, adminProductImageUploads } from './admin';
import { toast } from 'sonner';
vi.mock('./admin', () => ({ adminProducts: { listProducts: vi.fn(), changePrice: vi.fn() }, adminProductImageUploads: { upload: vi.fn() } }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
const id = (n: number) => '93000000-0000-4000-8000-' + String(n).padStart(12, '0');
const png = [137,80,78,71,13,10,26,10,0,0,0,0];
function file(type = 'image/png', header = png, size = header.length) {
 const value = new File([new Uint8Array(header)], 'arbitrary-name.svg', { type });
 Object.defineProperty(value, 'size', { value: size });
 Object.defineProperty(value, 'slice', { configurable:true, value: () => ({ arrayBuffer: async () => new Uint8Array(header).buffer }) });
 return value;
}
const target = (n: number) => ({ id: id(n), expected: ['/old.png'], files: [file()], replaceLegacy: false });
const product = (n = 1) => ({ id: id(n), name: 'عکس تازه ' + n, images: ['/old.png'] } as AdminProduct);
const empty: ProductImageUploadReport = { succeeded: [], unchanged: [], failed: [], unattempted: [], attempts: [] };
function harness() {
 const verify = vi.fn().mockResolvedValue(undefined), change = vi.fn().mockResolvedValue(undefined), upload = vi.fn().mockResolvedValue('https://cdn.invalid/fresh.png');
 const service = createProductImageUploadService({ verify, change }, { upload }, () => '94000000-0000-4000-8000-000000000001');
 return { verify, change, upload, service };
}
afterEach(() => { cleanup(); vi.restoreAllMocks(); });
describe('fresh image validation', () => {
 it.each([['image/png', png], ['image/jpeg', [255,216,255,0]], ['image/webp', [82,73,70,70,0,0,0,0,87,69,66,80]]] as const)('accepts matching %s headers without trusting file extensions', async (type, header) => {
  expect((await validateImageUploadBatch([{ ...target(1), files: [file(type, [...header])] }]))[0].files).toHaveLength(1);
 });
 it.each(['image/svg+xml', 'text/html', 'image/gif', ''])('refuses %s before any upload', async type => {
  const s=harness(); await expect(s.service.upload([{ ...target(1), files: [file(type)] }], () => true)).rejects.toThrow(); expect(s.upload).not.toHaveBeenCalled();
 });
 it.each([0, 5*1024*1024+1])('rejects file size %s', async size => { await expect(validateImageUploadBatch([{ ...target(1), files: [file('image/png', png, size)] }])).rejects.toThrow(); });
 it('validates every target before the first storage/read request', async () => {
  const s = harness(); await expect(s.service.upload([target(1), { ...target(2), files: [file('image/png', [60,104,116,109,108])] }], () => true)).rejects.toThrow(); expect(s.verify).not.toHaveBeenCalled(); expect(s.upload).not.toHaveBeenCalled();
 });
 it('bounds per-product file count, batch file count and bytes', async () => {
  await expect(validateImageUploadBatch([{ ...target(1), files: Array.from({ length:6 }, () => file()) }])).rejects.toThrow();
  await expect(validateImageUploadBatch(Array.from({ length:5 }, (_,n) => ({ ...target(n), files: Array.from({ length:5 }, () => file()) })))).rejects.toThrow();
  await expect(validateImageUploadBatch(Array.from({ length:3 }, (_,n) => ({ ...target(n), files: Array.from({ length:3 }, () => file('image/png', png, 5*1024*1024)) })))).rejects.toThrow();
 });
 it('requires explicit legacy replacement intent and refuses duplicate IDs or overlong galleries', async () => {
  await expect(validateImageUploadBatch([{ ...target(1), expected: [] }])).rejects.toThrow();
  expect((await validateImageUploadBatch([{ ...target(1), expected: [], replaceLegacy: true }]))[0].expected).toEqual([]);
  await expect(validateImageUploadBatch([target(1), target(1)])).rejects.toThrow();
  await expect(validateImageUploadBatch([{ ...target(1), expected: Array(50).fill('/old.png') }])).rejects.toThrow();
 });
 it('freezes files and image arrays before asynchronous content checks', async () => {
  const input = target(1), pending = validateImageUploadBatch([input]); input.expected.push('/changed.png'); input.files.push(file());
  const queue = await pending; expect(queue[0].expected).toEqual(['/old.png']); expect(queue[0].files).toHaveLength(1);
 });
});
describe('upload execution and ambiguous outcomes', () => {
 it('maps each file to its own product, preserves existing cover and never uses the supplied filename', async () => {
  const s=harness(); const result = await s.service.upload([target(1), target(2)], () => true);
  expect(result.succeeded).toEqual([id(1), id(2)]); expect(result.attempts.every(item => item.state === 'linked')).toBe(true);
  expect(s.upload.mock.calls[0][0]).toBe(id(1) + '-94000000-0000-4000-8000-000000000001.png'); expect(s.upload.mock.calls[1][0]).toContain(id(2));
  expect(s.change).toHaveBeenNthCalledWith(1, { id: id(1), expected: ['/old.png'], next: ['/old.png', 'https://cdn.invalid/fresh.png'] });
 });
 it('does not upload anything for an obsolete owner', async () => {
  const s=harness(); expect((await s.service.upload([target(1)], () => false)).unattempted).toEqual([id(1)]); expect(s.verify).not.toHaveBeenCalled();
 });
 it('refuses stale/denied preflight before uploads and stops later products', async () => {
  const s=harness(); s.verify.mockRejectedValueOnce(Error('denied')); const result=await s.service.upload([target(1),target(2)],()=>true);
  expect(result.failed).toEqual([id(1)]); expect(result.unattempted).toEqual([id(2)]); expect(s.upload).not.toHaveBeenCalled();
 });
 it('retains uploaded and unconfirmed paths after a second upload fails, without linking a partial gallery', async () => {
  const s=harness(); s.upload.mockResolvedValueOnce('https://cdn.invalid/one.png').mockRejectedValueOnce(Error('lost response'));
  const result=await s.service.upload([{ ...target(1), files: [file(),file()] },target(2)],()=>true);
  expect(result.attempts.map(item=>item.state)).toEqual(['uploaded-unlinked','upload-unconfirmed']); expect(result.failed).toEqual([id(1)]); expect(result.unattempted).toEqual([id(2)]); expect(s.change).not.toHaveBeenCalled(); expect(s.upload).toHaveBeenCalledTimes(2);
 });
 it('records a possibly committed write without rollback or retry when its response is lost', async () => {
  const s=harness(); s.change.mockRejectedValueOnce(Error('timeout')); const result=await s.service.upload([target(1),target(2)],()=>true);
  expect(result.succeeded).toEqual([]); expect(result.attempts[0].state).toBe('link-unconfirmed'); expect(s.change).toHaveBeenCalledTimes(1); expect(s.upload).toHaveBeenCalledTimes(1);
 });
 it('stops after an in-flight upload on logout, without dispatching metadata or later files', async () => {
  const s=harness(); let current=true; s.upload.mockImplementationOnce(async()=>{ current=false; return 'https://cdn.invalid/new.png'; });
  const result=await s.service.upload([{ ...target(1), files: [file(),file()] },target(2)],()=>current);
  expect(result.attempts[0].state).toBe('uploaded-unlinked'); expect(s.upload).toHaveBeenCalledTimes(1); expect(s.change).not.toHaveBeenCalled(); expect(result.unattempted).toEqual([id(2)]);
 });
 it('rejects an invalid storage response before metadata writes', async () => {
  const s=harness(); s.upload.mockResolvedValueOnce('javascript:alert(1)'); const result=await s.service.upload([target(1)],()=>true); expect(result.failed).toEqual([id(1)]); expect(s.change).not.toHaveBeenCalled();
 });
});
describe('signed-in storage adapter', () => {
 it('uses product-images with insert-only typed uploads and confirms the returned path', async () => {
  const upload=vi.fn().mockResolvedValue({ data:{ path:'safe.png' },error:null }), getPublicUrl=vi.fn().mockReturnValue({ data:{ publicUrl:'https://cdn.invalid/safe.png' } });
  const from=vi.fn().mockReturnValue({ upload,getPublicUrl }), storage=createSupabaseProductBatchImageStorage({ storage:{ from } } as unknown as Pick<SupabaseClient<Database>,'storage'>), selected=file();
  expect(await storage.upload('safe.png',selected)).toBe('https://cdn.invalid/safe.png'); expect(from).toHaveBeenCalledWith('product-images'); expect(upload).toHaveBeenCalledWith('safe.png',selected,{ upsert:false,contentType:'image/png' });
  upload.mockResolvedValueOnce({ data:{ path:'wrong.png' },error:null }); await expect(storage.upload('safe.png',selected)).rejects.toThrow(); expect(getPublicUrl).toHaveBeenCalledTimes(1);
 });
 it('verifies the exact array with the installed SDK before uploads, then CAS confirms appended images', async () => {
  const requests: {url:URL; method?:string; body:unknown}[]=[];
  const fetch=vi.fn().mockImplementation(async(input:RequestInfo|URL,init?:RequestInit)=>{ requests.push({ url:new URL(String(input)),method:init?.method,body:init?.body?JSON.parse(String(init.body)):null }); return new Response(JSON.stringify({ id:id(1),images:init?.method==='PATCH'?['/old.png','https://cdn.invalid/new.png']:['/old.png'] }),{ status:200,headers:{ 'content-type':'application/json' } }); });
  const client=createClient<Database>('https://synthetic.invalid','public-test-key',{ global:{ fetch },auth:{ persistSession:false,autoRefreshToken:false,detectSessionInUrl:false } });
  const repo=createSupabaseProductImageUploadRepository(client); await repo.verify(target(1)); await repo.change({ id:id(1),expected:['/old.png'],next:['/old.png','https://cdn.invalid/new.png'] });
  expect(requests.map(item=>item.url.searchParams.get('images'))).toEqual(['eq.{"/old.png"}','eq.{"/old.png"}']); expect(requests[1].body).toEqual({ images:['/old.png','https://cdn.invalid/new.png'] });
 });
});
describe('per-product file mapping and preview', () => {
 function setup(products=[product()]) {
  vi.stubGlobal('URL', URL); Object.defineProperty(URL,'createObjectURL',{ configurable:true,value:vi.fn().mockReturnValue('blob:local-preview') }); Object.defineProperty(URL,'revokeObjectURL',{ configurable:true,value:vi.fn() });
  const submit=vi.fn().mockResolvedValue({ ...empty,succeeded:[id(1)] });
  const view=render(<ProductImageUploadControls selected={products} busy={false} submit={submit}/>); fireEvent.click(screen.getByRole('button',{ name:'بارگذاری گروهی عکس تازه' }));
  return { submit,...view };
 }
 it('shows local previews and does not upload on cancellation; releases local URLs on unmount', async () => {
  const s=setup(); fireEvent.change(screen.getByLabelText('فایل‌های تازه عکس تازه 1'),{ target:{ files:[file()] } });
  fireEvent.click(screen.getByRole('button',{ name:'پیش‌نمایش بارگذاری' })); await screen.findByRole('dialog'); expect(s.submit).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button',{ name:'انصراف' })); expect(s.submit).not.toHaveBeenCalled(); s.unmount(); expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:local-preview');
 });
 it('submits only products with selected files, once, and clears drafts after an uncertain result', async () => {
  const s=setup([product(),product(2)]); s.submit.mockResolvedValue({ ...empty,failed:[id(1)],attempts:[{ productId:id(1),path:'uncertain.png',state:'link-unconfirmed' }] });
  fireEvent.change(screen.getByLabelText('فایل‌های تازه عکس تازه 1'),{ target:{ files:[file()] } }); fireEvent.click(screen.getByRole('button',{ name:'پیش‌نمایش بارگذاری' })); await screen.findByRole('dialog');
  fireEvent.click(screen.getByRole('button',{ name:'تأیید و بارگذاری عکس‌ها' })); await waitFor(()=>expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  expect(s.submit.mock.calls[0][0]).toHaveLength(1); expect(s.submit.mock.calls[0][0][0].id).toBe(id(1)); expect(screen.getByRole('button',{ name:'پیش‌نمایش بارگذاری' })).toBeDisabled(); expect(screen.getByText('uncertain.png')).toBeInTheDocument();
 });
 it('requires a deliberate legacy-gallery replacement checkbox before preview', async () => {
  setup([{ ...product(), images: [] }]); fireEvent.change(screen.getByLabelText('فایل‌های تازه عکس تازه 1'),{ target:{ files:[file()] } });
  fireEvent.click(screen.getByRole('button',{ name:'پیش‌نمایش بارگذاری' })); await screen.findByRole('alert'); expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('checkbox')); fireEvent.click(screen.getByRole('button',{ name:'پیش‌نمایش بارگذاری' })); expect(await screen.findByRole('dialog')).toHaveTextContent('جای گالری قدیمیِ احتمالی');
 });
 it('discards a pending preview when the product selection changes', async () => {
  const s=setup(); let finish!: (value:ArrayBuffer)=>void;
  const selectedFile=file(); Object.defineProperty(selectedFile,'slice',{ configurable:true,value:()=>({ arrayBuffer:()=>new Promise<ArrayBuffer>(resolve=>{ finish=resolve; }) }) });
  fireEvent.change(screen.getByLabelText('فایل‌های تازه عکس تازه 1'),{ target:{ files:[selectedFile] } }); fireEvent.click(screen.getByRole('button',{ name:'پیش‌نمایش بارگذاری' }));
  s.rerender(<ProductImageUploadControls selected={[product(2)]} busy={false} submit={s.submit}/>);
  await act(async()=>{ finish(new Uint8Array(png).buffer); }); expect(screen.queryByRole('dialog')).not.toBeInTheDocument(); expect(screen.getByRole('button',{ name:'پیش‌نمایش بارگذاری' })).toBeDisabled();
 });
 it('clears hidden file mappings on a selection change', async () => {
  const s=setup(); fireEvent.change(screen.getByLabelText('فایل‌های تازه عکس تازه 1'),{ target:{ files:[file()] } });
  s.rerender(<ProductImageUploadControls selected={[product(2)]} busy={false} submit={s.submit}/>); expect(screen.getByRole('button',{ name:'پیش‌نمایش بارگذاری' })).toBeDisabled(); expect(s.submit).not.toHaveBeenCalled();
 });
});

describe('upload batches use the shared screen and owner lock', () => {
 async function setupHook() {
  vi.clearAllMocks(); vi.mocked(adminProducts.listProducts).mockResolvedValue([product()]);
  const hook=renderHook(({ owner })=>useAdminProducts(owner),{ initialProps:{ owner:id(8) } }); await waitFor(()=>expect(hook.result.current.loading).toBe(false)); return hook;
 }
 it('blocks duplicate uploads and individual price mutations while the batch is pending', async () => {
  const hook=await setupHook(); let finish!: (value:ProductImageUploadReport)=>void;
  vi.mocked(adminProductImageUploads.upload).mockImplementationOnce(()=>new Promise(resolve=>{ finish=resolve; }));
  let first!: Promise<ProductImageUploadReport|undefined>;
  act(()=>{ first=hook.result.current.bulkImageUploads([target(1)]); });
  await act(async()=>{ expect(await hook.result.current.bulkImageUploads([target(1)])).toBeUndefined(); expect(await hook.result.current.changePrice(id(1),100)).toBe(false); });
  expect(adminProductImageUploads.upload).toHaveBeenCalledTimes(1); expect(adminProducts.changePrice).not.toHaveBeenCalled();
  await act(async()=>{ finish({ ...empty,succeeded:[id(1)] }); await first; }); expect(hook.result.current.busy).toBe(false);
 });
 it('refuses an image snapshot absent from the current loaded list', async () => {
  const hook=await setupHook(); await act(async()=>{ await hook.result.current.bulkImageUploads([{ ...target(1), expected:['/outdated.png'] }]); }); expect(adminProductImageUploads.upload).not.toHaveBeenCalled();
 });
 it('invalidates the queued service lifetime and ignores completion after account change', async () => {
  const hook=await setupHook(); let finish!: (value:ProductImageUploadReport)=>void, current!: ()=>boolean;
  vi.mocked(adminProductImageUploads.upload).mockImplementationOnce((_targets,scope)=>{ current=scope; return new Promise(resolve=>{ finish=resolve; }); });
  let first!: Promise<ProductImageUploadReport|undefined>; act(()=>{ first=hook.result.current.bulkImageUploads([target(1)]); }); expect(current()).toBe(true);
  hook.rerender({ owner:id(9) }); expect(current()).toBe(false);
  await act(async()=>{ finish({ ...empty,succeeded:[id(1)] }); expect(await first).toBeUndefined(); }); expect(toast.success).not.toHaveBeenCalled(); expect(hook.result.current.batchReport).toBeUndefined();
 });
});
