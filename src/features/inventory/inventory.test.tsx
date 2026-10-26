import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react';
import { createClient } from '@supabase/supabase-js';
import type { Database } from '@/integrations/supabase/types';
import { inventoryOffset, inventoryOverview, lowStockThreshold, parseInventoryPage, searchInventoryRows } from './domain/inventory';
import { createInventoryService } from './application/inventoryService';
import { createSupabaseInventoryRepository } from './infrastructure/supabaseInventoryRepository';
import { useInventory } from './presentation/useInventory';
import { adminInventory } from './admin';
import AdminInventory from '@/pages/admin/AdminInventory';
vi.mock('./admin',()=>({adminInventory:{read:vi.fn()}}));
vi.mock('@/stores/authStore',()=>({useAuthStore:(selector:(state:{user:{id:string}})=>unknown)=>selector({user:{id:'98000000-0000-4000-8000-000000000099'}})}));
const id=(n:number)=>'98000000-0000-4000-8000-'+String(n).padStart(12,'0');
const variant=(n:number,stock:unknown=2,sku:string|null='SKU-'+n)=>({id:id(n),product_id:id(1),sku,size:'M',color:'مشکی',stock_quantity:stock});
const product=(variants:unknown[]=[variant(2)])=>({id:id(1),name:'کالای تست انبار',is_active:true,is_out_of_stock:false,product_variants:variants});
const page=(variants:unknown[]=[variant(2)])=>parseInventoryPage([product(variants)],1,0);
afterEach(()=>{cleanup();vi.restoreAllMocks();});
describe('inventory quantities and completeness',()=>{
 it('preserves zero and flags malformed values instead of silently coercing them to zero',()=>{
  const result=page([variant(2,0),variant(3,-1),variant(4,'5'),variant(5,null),variant(6,1.5)]);
  expect(result.rows.map(row=>row.quantity)).toEqual([0,null,null,null,null]);const summary=inventoryOverview(result.rows,5).summary;expect(summary.zero).toBe(1);expect(summary.invalid).toBe(4);expect(summary.knownUnits).toBe(0);
 });
 it('represents products without variants as unknown, never as zero stock',()=>{
  const result=page([]),summary=inventoryOverview(result.rows,5).summary;expect(result.rows[0].quantity).toBeNull();expect(result.rows[0].variantId).toBeNull();expect(summary.zero).toBe(0);expect(summary.invalid).toBe(0);expect(summary.noVariant).toBe(1);
 });
 it('keeps product out-of-stock flags distinct from variant quantities',()=>{
  const result=parseInventoryPage([{...product([variant(2,12)]),is_out_of_stock:true}],1,0);expect(result.rows[0].quantity).toBe(12);expect(result.rows[0].markedOut).toBe(true);
 });
 it('marks over-200 variant products as partial and does not invent full totals',()=>{
  const variants=Array.from({length:201},(_,n)=>variant(n+2));const result=page(variants);expect(result.rows).toHaveLength(200);expect(result.truncatedProducts).toBe(1);expect(result.rows.every(row=>row.truncated)).toBe(true);
 });
 it.each([undefined,null,-1,1.5])('refuses missing or invalid total count (%#)',count=>{expect(()=>parseInventoryPage([product()],count,0)).toThrow();});
 it('refuses a short server page when the exact count says more rows should be present',()=>{expect(()=>parseInventoryPage([product()],51,0)).toThrow();expect(parseInventoryPage([],0,0).rows).toEqual([]);expect(parseInventoryPage([],1,50).rows).toEqual([]);});
 it('refuses malformed relationships, duplicate IDs or cross-product variant IDs',()=>{
  expect(()=>page([variant(2),variant(2)])).toThrow();expect(()=>page([{...variant(2),product_id:id(9)}])).toThrow();expect(()=>parseInventoryPage([{...product(),product_variants:null}],1,0)).toThrow();expect(()=>parseInventoryPage([product(),product()],2,0)).toThrow();
 });
 it.each([-50,1,NaN,Infinity,2_000_000_050])('refuses invalid page offset %s before querying',async offset=>{const read=vi.fn();await expect(createInventoryService({read}).read(offset)).rejects.toThrow();expect(read).not.toHaveBeenCalled();});
 it('accepts a safe bounded database integer and refuses overflow',()=>{expect(page([variant(2,2_147_483_647)]).rows[0].quantity).toBe(2_147_483_647);expect(page([variant(2,2_147_483_648)]).rows[0].quantity).toBeNull();expect(inventoryOffset(50)).toBe(50);});
});
describe('inventory search and review filters',()=>{
 it('searches Persian/Arabic normalized words, codes, size and color together',()=>{
  const rows=parseInventoryPage([{...product([variant(2,1,'sku-۱۲۳')]),name:'كفش علي'}],1,0).rows;expect(searchInventoryRows(rows,'کفش علی SKU-123 مشکی M')).toHaveLength(1);expect(searchInventoryRows(rows,'آبی')).toEqual([]);
 });
 it('separates zero, positive low stock and unknown quantities',()=>{
  const rows=page([variant(2,0),variant(3,1),variant(4,5),variant(5,6),variant(6,-1)]).rows,view=inventoryOverview(rows,5);expect(rows.filter(row=>view.matches(row,'zero'))).toHaveLength(1);expect(rows.filter(row=>view.matches(row,'low'))).toHaveLength(2);expect(rows.filter(row=>view.matches(row,'invalid'))).toHaveLength(1);
 });
 it('treats normalized duplicate SKU and missing codes as page-local review findings',()=>{
  const rows=page([variant(2,2,' ABC-۱۲ '),variant(3,3,'abc-12'),variant(4,4,' '),variant(5,5,null)]).rows,view=inventoryOverview(rows,5);expect(view.summary.duplicateSku).toBe(2);expect(view.summary.missingSku).toBe(2);expect(rows.filter(row=>view.matches(row,'duplicate-sku'))).toHaveLength(2);
 });
 it('a zero low-stock threshold does not classify zero as positive low stock',()=>{const view=inventoryOverview(page([variant(2,0),variant(3,1)]).rows,0);expect(view.summary.low).toBe(0);expect(view.summary.zero).toBe(1);});
 it.each(['','-1','1.5','100001','1e2','۵۰x'])('refuses an invalid threshold %s',value=>{expect(()=>lowStockThreshold(value)).toThrow();});
 it('accepts Persian and Arabic digits for a session-only review threshold',()=>{expect(lowStockThreshold(' ۵ ')).toBe(5);expect(lowStockThreshold('١٢')).toBe(12);expect(lowStockThreshold('100000')).toBe(100000);});
});
describe('installed SDK inventory query',()=>{
 it('issues only a bounded ordered GET with count and separately limited nested variants',async()=>{
  const requests:{url:URL;method?:string;prefer?:string}[]=[];const fetch=vi.fn().mockImplementation(async(input:RequestInfo|URL,init?:RequestInit)=>{requests.push({url:new URL(String(input)),method:init?.method,prefer:new Headers(init?.headers).get('prefer')??undefined});return new Response(JSON.stringify([product()]),{status:200,headers:{'content-type':'application/json','content-range':'50-50/51'}});});
  const client=createClient<Database>('https://synthetic.invalid','public-test-key',{global:{fetch},auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}});const result=await createInventoryService(createSupabaseInventoryRepository(client)).read(50);expect(result.rows[0].quantity).toBe(2);
  expect(requests).toHaveLength(1);const request=requests[0];expect(request.method).toBe('GET');expect(request.prefer).toContain('count=exact');expect(request.url.searchParams.get('offset')).toBe('50');expect(request.url.searchParams.get('limit')).toBe('50');expect(request.url.searchParams.get('order')).toBe('name.asc,id.asc');expect(request.url.searchParams.get('product_variants.limit')).toBe('201');expect(request.url.searchParams.get('product_variants.order')).toBe('id.asc');
 });
 it('propagates denied reads instead of fabricating empty inventory',async()=>{
  const client=createClient<Database>('https://synthetic.invalid','public-test-key',{global:{fetch:async()=>new Response(JSON.stringify({code:'42501',message:'denied'}),{status:403,headers:{'content-type':'application/json'}})},auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}});await expect(createInventoryService(createSupabaseInventoryRepository(client)).read(0)).rejects.toMatchObject({code:'42501'});
 });
});
describe('owner-scoped inventory read',()=>{
 it('does not fetch when signed out',()=>{vi.clearAllMocks();renderHook(()=>useInventory(undefined,0));expect(adminInventory.read).not.toHaveBeenCalled();});
 it('hides the previous page immediately and ignores its late completion',async()=>{
  let finish!:(value:ReturnType<typeof page>)=>void;vi.mocked(adminInventory.read).mockImplementationOnce(()=>new Promise(resolve=>{finish=resolve;})).mockResolvedValueOnce(parseInventoryPage([],0,50));
  const hook=renderHook(({offset})=>useInventory(id(9),offset),{initialProps:{offset:0}});hook.rerender({offset:50});expect(hook.result.current.value).toBeUndefined();await waitFor(()=>expect(hook.result.current.value?.offset).toBe(50));await act(async()=>{finish(page());});expect(hook.result.current.value?.offset).toBe(50);
 });
 it('hides previous owner data immediately when an account changes',async()=>{
  vi.mocked(adminInventory.read).mockResolvedValue(page());const hook=renderHook(({owner})=>useInventory(owner,0),{initialProps:{owner:id(8)}});await waitFor(()=>expect(hook.result.current.value).toBeDefined());hook.rerender({owner:undefined});expect(hook.result.current.value).toBeUndefined();
 });
});
describe('inventory page',()=>{
 it('shows review flags and filtering without an inline stock editor',async()=>{
  vi.mocked(adminInventory.read).mockResolvedValue(page([variant(2,2,'SKU-2'),variant(3,0,null)]));render(<AdminInventory/>);await screen.findByText(/خلاصهٔ همین صفحه: 2 تنوع؛ 1 کمبود؛ 1 موجودی صفر/);
  fireEvent.change(screen.getByLabelText('فیلتر انبار'),{target:{value:'zero'}});expect(screen.queryByText('SKU-2')).not.toBeInTheDocument();fireEvent.click(screen.getByRole('button',{name:'جزئیات تنوع‌ها'}));expect(screen.getByText('کد ثبت نشده')).toBeInTheDocument();expect(screen.queryByLabelText('افزایش یا کاهش موجودی')).not.toBeInTheDocument();
 });
 it('shows read failure distinctly and retries without fabricated zeros',async()=>{
  vi.mocked(adminInventory.read).mockRejectedValueOnce(Error('denied')).mockResolvedValueOnce(page());render(<AdminInventory/>);await screen.findByRole('alert');expect(screen.queryByText(/خلاصهٔ همین صفحه/)).not.toBeInTheDocument();fireEvent.click(screen.getByRole('button',{name:'تلاش دوباره'}));await screen.findByText(/خلاصهٔ همین صفحه/);
 });
 it('invalid thresholds do not reuse previous counts as if they were valid',async()=>{
  vi.mocked(adminInventory.read).mockResolvedValue(page());render(<AdminInventory/>);await screen.findByText(/خلاصهٔ همین صفحه/);fireEvent.change(screen.getByLabelText('حد کمبود موجودی'),{target:{value:'-1'}});expect(screen.getByRole('alert')).toHaveTextContent('حد کمبود');expect(screen.queryByText(/خلاصهٔ همین صفحه/)).not.toBeInTheDocument();
 });
});
