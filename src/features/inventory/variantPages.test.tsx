import {afterEach,expect,it,vi} from 'vitest';
import {cleanup,fireEvent,render,screen} from '@testing-library/react';
import {createClient} from '@supabase/supabase-js';
import type {Database} from '@/integrations/supabase/types';
import {parseVariantPage} from './domain/variantPages';
import {createSupabaseVariantPages} from './infrastructure/supabaseVariantPages';
import {InventoryVariantPages} from './presentation/InventoryVariantPages';
import {adminInventoryVariantPages} from './admin';
vi.mock('./admin',()=>({adminInventoryVariantPages:{read:vi.fn()}}));
vi.mock('./presentation/InventoryAdjustmentControls',()=>({InventoryAdjustmentControls:({row}:{row:{sku:string}})=><p>تاریخچهٔ {row.sku}</p>}));
vi.mock('./presentation/InventoryBalanceDialog',()=>({InventoryBalanceDialog:()=>null}));
vi.mock('./presentation/InventoryPolicyDialog',()=>({InventoryPolicyDialog:()=>null}));
const id=(n:number)=>'98000000-0000-4000-8000-'+String(n).padStart(12,'0');
const variant=(n:number)=>({id:id(n),product_id:id(1),sku:'SKU-'+n,size:'M',color:null,stock_quantity:n});
const product=(rows:unknown[])=>[{id:id(1),name:'محصول پرتنوع',is_active:true,is_out_of_stock:false,product_variants:rows}];
const page=(start:number,count:number,after:string|null)=>parseVariantPage(product(Array.from({length:count},(_,i)=>variant(start+i))),id(1),after);
afterEach(()=>{cleanup();vi.resetAllMocks();});
it('navigates all 251 variants with exclusive UUID cursors and no 200-row dead end',()=>{
 let after:string|null=null;const ids:string[]=[];for(let start=2;start<=252;start+=50){const count=Math.min(51,253-start),p=page(start,count,after);ids.push(...p.rows.map(r=>r.variantId!));expect(p.hasMore).toBe(count===51);after=p.nextCursor;}
 expect(ids).toHaveLength(251);expect(new Set(ids).size).toBe(251);expect(ids.at(-1)).toBe(id(252));expect(after).toBeNull();
});
it('returns a valid empty continuation page without inventing a stock row',()=>{expect(page(2,0,id(200))).toMatchObject({rows:[],hasMore:false,nextCursor:null});});
it('rejects foreign products, missing parents, duplicate/reversed cursors and oversized reads',()=>{
 expect(()=>parseVariantPage([],id(1),null)).toThrow();expect(()=>parseVariantPage(product([variant(2)]),id(9),null)).toThrow();expect(()=>page(2,52,null)).toThrow();expect(()=>parseVariantPage(product([variant(3),variant(2)]),id(1),null)).toThrow();expect(()=>parseVariantPage(product([variant(2),variant(2)]),id(1),null)).toThrow();expect(()=>page(2,1,id(2))).toThrow();
});
it('builds a bounded relationship GET with an exclusive child cursor using the installed SDK',async()=>{
 let request:URL|undefined;const send=vi.fn(async(input:RequestInfo|URL)=>{request=new URL(String(input));return new Response(JSON.stringify(product([variant(202)])),{status:200,headers:{'Content-Type':'application/json'}});});
 const client=createClient<Database>('https://inventory.invalid','offline-placeholder',{auth:{persistSession:false,autoRefreshToken:false},global:{fetch:send}});
 const result=await createSupabaseVariantPages(client).read(id(1),id(201));expect(result.rows[0].variantId).toBe(id(202));expect(request!.searchParams.get('id')).toBe('eq.'+id(1));expect(request!.searchParams.get('product_variants.id')).toBe('gt.'+id(201));expect(request!.searchParams.get('product_variants.limit')).toBe('51');expect(request!.searchParams.get('product_variants.order')).toBe('id.asc');expect(send).toHaveBeenCalledTimes(1);
});
it('rejects bad IDs before any request and propagates denied reads',async()=>{
 const from=vi.fn();await expect(createSupabaseVariantPages({from} as never).read('bad',null)).rejects.toThrow();expect(from).not.toHaveBeenCalled();
 const client=createClient<Database>('https://inventory.invalid','offline-placeholder',{auth:{persistSession:false,autoRefreshToken:false},global:{fetch:async()=>new Response(JSON.stringify({message:'denied'}),{status:403,headers:{'Content-Type':'application/json'}})}});await expect(createSupabaseVariantPages(client).read(id(1),null)).rejects.toBeTruthy();
});
it('opens the history controls for a variant beyond the old cap',async()=>{
 vi.mocked(adminInventoryVariantPages.read).mockImplementation(async(_id,after)=>after?page(202,1,after):page(152,51,null));
 render(<InventoryVariantPages ownerId={id(9)} productId={id(1)} close={vi.fn()} refresh={vi.fn()}/>);await screen.findByText(/SKU-152/);fireEvent.click(screen.getByRole('button',{name:'تنوع‌های بعدی'}));await screen.findByText(/SKU-202/);expect(screen.queryByText(/SKU-152/)).toBeNull();fireEvent.click(screen.getByRole('button',{name:'اصلاح و تاریخچهٔ تنوع'}));await screen.findByText('تاریخچهٔ SKU-202');
});
it('does not show an old-owner completion in the next account',async()=>{
 let finish:(v:ReturnType<typeof page>)=>void=()=>{};vi.mocked(adminInventoryVariantPages.read).mockImplementationOnce(()=>new Promise(resolve=>{finish=resolve;})).mockResolvedValue(page(202,1,null));
 const rendered=render(<InventoryVariantPages ownerId={id(9)} productId={id(1)} close={vi.fn()} refresh={vi.fn()}/>);rendered.rerender(<InventoryVariantPages ownerId={id(10)} productId={id(1)} close={vi.fn()} refresh={vi.fn()}/>);await screen.findByText(/SKU-202/);finish(page(2,1,null));await Promise.resolve();expect(screen.queryByText('SKU-2؛ M / —؛ موجودی: ۲')).toBeNull();
});
it('keeps read failure distinct from an empty page and disables forward navigation',async()=>{
 vi.mocked(adminInventoryVariantPages.read).mockRejectedValue(Error('unavailable'));render(<InventoryVariantPages ownerId={id(9)} productId={id(1)} close={vi.fn()} refresh={vi.fn()}/>);await screen.findByRole('alert');expect(screen.queryByText('تنوعی در این صفحه وجود ندارد.')).toBeNull();expect(screen.getByRole('button',{name:'تنوع‌های بعدی'})).toBeDisabled();
});
