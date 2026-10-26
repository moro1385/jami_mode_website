import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { createClient } from '@supabase/supabase-js';
import type { Database } from '@/integrations/supabase/types';
import type { AdminProduct } from './domain/adminProducts';
import type { ImageUploadAttempt } from './application/productImageUploadService';
import { createProductImageUploadService } from './application/productImageUploadService';
import { createBrowserImageRecoveryJournal } from './infrastructure/browserProductImageRecovery';
import { createSupabaseProductImageGalleryReader } from './infrastructure/supabaseProductImageGalleries';
import { ProductImageRecoveryControls } from './presentation/ProductImageRecoveryControls';
import { adminProductImageRecovery } from './admin';
vi.mock('./admin',()=>({ adminProductImageRecovery:{ list:vi.fn(),forget:vi.fn(),readGallery:vi.fn(),inspect:vi.fn() } }));
const id=(n:number)=>'96000000-0000-4000-8000-'+String(n).padStart(12,'0');
const attempt=(n=1):ImageUploadAttempt=>({ productId:id(1),path:id(1)+'-'+id(n)+'.png',state:'upload-unconfirmed' });
function storage() {
 const values=new Map<string,string>();
 return { values,get length(){ return values.size; },key:(index:number)=>[...values.keys()][index]??null,getItem:(key:string)=>values.get(key)??null,setItem:vi.fn((key:string,value:string)=>{values.set(key,value);}),removeItem:vi.fn((key:string)=>{values.delete(key);}) };
}
function file() {
 const header=new Uint8Array([137,80,78,71,13,10,26,10]);
 const value=new File([header],'test.png',{type:'image/png'});
 Object.defineProperty(value,'slice',{value:()=>({arrayBuffer:async()=>header.buffer})});return value;
}
const product={id:id(1),name:'گالری تست',images:[]} as AdminProduct;
afterEach(()=>{ cleanup();vi.restoreAllMocks(); });
describe('owner and project scoped local recovery journal',()=>{
 it('survives a new journal instance without storing files, credentials or unknown properties',()=>{
  const s=storage(), journal=createBrowserImageRecoveryJournal(id(8),s,()=>10); journal.record({...attempt(),secret:'never persist'} as ImageUploadAttempt);
  expect(createBrowserImageRecoveryJournal(id(8),s).list()).toEqual([{...attempt(),updatedAt:10}]); expect([...s.values.values()].join()).not.toContain('secret');
 });
 it('isolates account and project journals without deleting unrelated local data',()=>{
  const s=storage();s.setItem('unrelated','untouched');createBrowserImageRecoveryJournal(id(8),s).record(attempt());
  expect(createBrowserImageRecoveryJournal(id(9),s).list()).toEqual([]);expect(createBrowserImageRecoveryJournal(id(8),s,undefined,'another-project').list()).toEqual([]);expect(s.getItem('unrelated')).toBe('untouched');
 });
 it('uses separate keys so two tabs cannot lose distinct pending object paths in an array overwrite',()=>{
  const s=storage(),a=createBrowserImageRecoveryJournal(id(8),s),b=createBrowserImageRecoveryJournal(id(8),s);a.record(attempt(1));b.record(attempt(2));a.record({...attempt(1),state:'uploaded-unlinked'});
  expect(b.list()).toHaveLength(2);expect(b.list().find(item=>item.path===attempt(1).path)?.state).toBe('uploaded-unlinked');
 });
 it('preserves corrupt or unsupported saved data and refuses overwrite',()=>{
  const s=storage(),journal=createBrowserImageRecoveryJournal(id(8),s);journal.record(attempt());const key=[...s.values.keys()][0];s.values.set(key,'{bad json');
  expect(()=>journal.record(attempt(2))).toThrow();expect(s.getItem(key)).toBe('{bad json');expect(s.values.size).toBe(1);
 });
 it('bounds unresolved entries without evicting old uncertainty',()=>{
  const s=storage(),journal=createBrowserImageRecoveryJournal(id(8),s);for(let n=1;n<=200;n++) journal.record(attempt(n));
  expect(()=>journal.record(attempt(201))).toThrow();expect(journal.list()).toHaveLength(200);journal.record({...attempt(1),state:'link-unconfirmed'});expect(journal.list()).toHaveLength(200);
 });
 it.each(['../outside.png','https://evil.invalid/a.png','wrong.png'])('refuses unsafe path %s',path=>{
  const journal=createBrowserImageRecoveryJournal(id(8),storage());expect(()=>journal.record({...attempt(),path})).toThrow();
 });
 it('does not silently accept denied or discarded browser writes',()=>{
  const s=storage();s.setItem.mockImplementationOnce(()=>{throw Error('Quota');});expect(()=>createBrowserImageRecoveryJournal(id(8),s).record(attempt())).toThrow();
  s.setItem.mockImplementationOnce(()=>{});expect(()=>createBrowserImageRecoveryJournal(id(8),s).record(attempt())).toThrow();
 });
 it('only closes exact owned notes and leaves other accounts intact',()=>{
  const s=storage(),a=createBrowserImageRecoveryJournal(id(8),s),b=createBrowserImageRecoveryJournal(id(9),s);a.record(attempt());b.record(attempt(2));expect(()=>a.forget([attempt(2).path])).toThrow();a.forget([attempt().path]);expect(a.list()).toEqual([]);expect(b.list()).toHaveLength(1);
 });
});
describe('journal precedes every potentially ambiguous remote effect',()=>{
 function harness(){const s=storage(),journal=createBrowserImageRecoveryJournal(id(8),s),verify=vi.fn().mockResolvedValue(undefined),change=vi.fn().mockResolvedValue(undefined),upload=vi.fn().mockResolvedValue('https://cdn.invalid/new.png');return{s,journal,verify,change,upload,service:createProductImageUploadService({verify,change},{upload},()=>id(2))};}
 const targets=()=>[{id:id(1),expected:['/old.png'],files:[file()],replaceLegacy:false}];
 it('saves the path before upload, saves uncertain metadata state before the write, and closes only after confirmed linking',async()=>{
  const h=harness();h.upload.mockImplementationOnce(async()=>{expect(h.journal.list()[0].state).toBe('upload-unconfirmed');return'https://cdn.invalid/new.png';});h.change.mockImplementationOnce(async()=>{expect(h.journal.list()[0].state).toBe('link-unconfirmed');});
  expect((await h.service.upload(targets(),()=>true,h.journal)).succeeded).toEqual([id(1)]);expect(h.journal.list()).toEqual([]);
 });
 it('refuses storage upload when the pre-upload note cannot be persisted',async()=>{
  const h=harness();h.s.setItem.mockImplementation(()=>{throw Error('storage blocked');});expect((await h.service.upload(targets(),()=>true,h.journal)).failed).toEqual([id(1)]);expect(h.upload).not.toHaveBeenCalled();expect(h.change).not.toHaveBeenCalled();
 });
 it('keeps the path after a lost upload response across a fresh journal instance',async()=>{
  const h=harness();h.upload.mockRejectedValueOnce(Error('lost response'));await h.service.upload(targets(),()=>true,h.journal);expect(createBrowserImageRecoveryJournal(id(8),h.s).list()[0].state).toBe('upload-unconfirmed');expect(h.change).not.toHaveBeenCalled();
 });
 it('does not dispatch metadata if its uncertainty cannot be saved',async()=>{
  const h=harness();const realRecord=h.journal.record;h.journal.record=(value)=>{if(value.state==='link-unconfirmed')throw Error('disk full');realRecord(value);};
  const result=await h.service.upload(targets(),()=>true,h.journal);expect(result.failed).toEqual([id(1)]);expect(h.change).not.toHaveBeenCalled();expect(h.journal.list()[0].state).toBe('uploaded-unlinked');
 });
 it('keeps possibly linked files documented instead of deleting after a lost metadata response',async()=>{
  const h=harness();h.change.mockRejectedValueOnce(Error('timeout'));const result=await h.service.upload(targets(),()=>true,h.journal);expect(result.failed).toEqual([id(1)]);expect(h.journal.list()[0].state).toBe('link-unconfirmed');expect(h.upload).toHaveBeenCalledTimes(1);
 });
 it('does not relabel a confirmed database write as failed when local note cleanup fails',async()=>{
  const h=harness();h.s.removeItem.mockImplementationOnce(()=>{throw Error('blocked');});const result=await h.service.upload(targets(),()=>true,h.journal);expect(result.succeeded).toEqual([id(1)]);expect(result.recoveryWarning).toBe(true);expect(h.journal.list()[0].state).toBe('link-unconfirmed');
 });
});
describe('read-only current and legacy galleries',()=>{
 function client(response:unknown,status=200){const fetch=vi.fn().mockResolvedValue(new Response(JSON.stringify(response),{status,headers:{'content-type':'application/json'}}));return{fetch,reader:createSupabaseProductImageGalleryReader(createClient<Database>('https://synthetic.invalid','public-test-key',{global:{fetch},auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}}))};}
 it('uses the installed SDK for one bounded read with the legacy relationship and preserves main order',async()=>{
  const s=client({id:id(1),images:['/main-b.png','/main-a.png'],product_images:[{id:id(2),image_url:'/legacy-b.png',sort_order:2},{id:id(3),image_url:'/legacy-a.png',sort_order:1}]});const result=await s.reader.read(id(1));expect(result.main).toEqual(['/main-b.png','/main-a.png']);expect(result.legacy.map(item=>item.url)).toEqual(['/legacy-a.png','/legacy-b.png']);
  const [url,init]=s.fetch.mock.calls[0];expect(new URL(String(url)).searchParams.get('select')).toBe('id,images,product_images(id,image_url,sort_order)');expect(init.method).toBe('GET');
 });
 it.each([null,{id:id(2),images:[],product_images:[]},{id:id(1),images:[],product_images:null},{id:id(1),images:[],product_images:[{id:id(2),image_url:'javascript:alert(1)',sort_order:0}]}])('refuses missing, mismatched and unsafe gallery data (%#)',async response=>{await expect(client(response).reader.read(id(1))).rejects.toThrow();});
 it('does not turn permission failures into an empty gallery',async()=>{await expect(client({message:'denied'},403).reader.read(id(1))).rejects.toBeTruthy();});
});
describe('recovery controls',()=>{
 function setup(){vi.clearAllMocks();vi.mocked(adminProductImageRecovery.list).mockReturnValue([{...attempt(),updatedAt:10}]);return render(<ProductImageRecoveryControls selected={[product]} ownerId={id(8)} busy={false}/>);}
 it('reads notes lazily, exposes a copyable report and closes only the local note on explicit action',async()=>{
  setup();expect(adminProductImageRecovery.list).not.toHaveBeenCalled();fireEvent.click(screen.getByRole('button',{name:'گالری قدیمی و بازیابی بارگذاری'}));await screen.findByText('1 یادداشت نیازمند بررسی در این مرورگر');expect((screen.getByLabelText('گزارش بازیابی قابل کپی') as HTMLTextAreaElement).value).toContain(attempt().path);
  fireEvent.click(screen.getByRole('button',{name:'بستن یادداشت پس از بررسی دستی'}));expect(adminProductImageRecovery.forget).toHaveBeenCalledWith(id(8),attempt().path);expect(adminProductImageRecovery.inspect).not.toHaveBeenCalled();
 });
 it('shows which gallery currently supplies storefront images without writing metadata',async()=>{
  setup();vi.mocked(adminProductImageRecovery.readGallery).mockResolvedValue({id:id(1),main:[],legacy:[{id:id(2),url:'/legacy.png',order:1}]});fireEvent.click(screen.getByRole('button',{name:'گالری قدیمی و بازیابی بارگذاری'}));fireEvent.click(screen.getByRole('button',{name:'مشاهده گالری فعلی و قدیمی گالری تست'}));await screen.findByText('فهرست اصلی خالی است؛ نمایش فعلی از گالری قدیمی است.');expect(screen.getByAltText('قدیمی 1')).toHaveAttribute('src','/legacy.png');expect(adminProductImageRecovery.forget).not.toHaveBeenCalled();
 });
 it('does not claim an orphan is safe to delete when only this product has been checked',async()=>{
  setup();vi.mocked(adminProductImageRecovery.inspect).mockResolvedValue({gallery:{id:id(1),main:[],legacy:[]},main:false,legacy:false});fireEvent.click(screen.getByRole('button',{name:'گالری قدیمی و بازیابی بارگذاری'}));await screen.findByText('1 یادداشت نیازمند بررسی در این مرورگر');fireEvent.click(screen.getByRole('button',{name:'بررسی ارتباط فایل با محصول'}));await screen.findByText(/استفادهٔ احتمالی در محصولات دیگر هنوز بررسی نشده/);expect(adminProductImageRecovery.forget).not.toHaveBeenCalled();
 });
 it('ignores an obsolete read completion after unmount',async()=>{
  const s=setup();let finish!:(value:{gallery:{id:string;main:string[];legacy:[]};main:boolean;legacy:boolean})=>void;vi.mocked(adminProductImageRecovery.inspect).mockImplementationOnce(()=>new Promise(resolve=>{finish=resolve;}));fireEvent.click(screen.getByRole('button',{name:'گالری قدیمی و بازیابی بارگذاری'}));await screen.findByText('1 یادداشت نیازمند بررسی در این مرورگر');fireEvent.click(screen.getByRole('button',{name:'بررسی ارتباط فایل با محصول'}));s.unmount();await act(async()=>{finish({gallery:{id:id(1),main:[],legacy:[]},main:true,legacy:false});});expect(screen.queryByText('این فایل در فهرست اصلی محصول ثبت است.')).not.toBeInTheDocument();
 });
 it('preserves an unavailable journal and shows an error rather than a fabricated empty success',async()=>{
  setup();vi.mocked(adminProductImageRecovery.list).mockImplementation(()=>{throw Error('blocked');});fireEvent.click(screen.getByRole('button',{name:'گالری قدیمی و بازیابی بارگذاری'}));await waitFor(()=>expect(screen.getByRole('alert')).toHaveTextContent('خواندن یادداشت‌ها ممکن نشد'));expect(screen.queryByText('0 یادداشت نیازمند بررسی در این مرورگر')).not.toBeInTheDocument();
 });
});
