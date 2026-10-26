import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {act,cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
import {ProductVariantsManager} from '@/components/admin/ProductVariantsManager';
import {adminProducts} from './admin';
import {adminInventoryActions} from '@/features/inventory/admin';
vi.mock('./admin',()=>({adminProducts:{listVariants:vi.fn(),updateVariantField:vi.fn(),addVariant:vi.fn(),deleteVariant:vi.fn()}}));
vi.mock('@/features/inventory/admin',()=>({adminInventoryActions:{status:vi.fn(),pending:vi.fn(),adjust:vi.fn(),history:vi.fn()}}));
let owner='a3000000-0000-4000-8000-000000000008';
vi.mock('@/stores/authStore',()=>({useAuthStore:(select:(state:{user:{id:string}})=>unknown)=>select({user:{id:owner}})}));
vi.mock('sonner',()=>({toast:{success:vi.fn(),error:vi.fn()}}));
const product='a3000000-0000-4000-8000-000000000001',variantId='a3000000-0000-4000-8000-000000000002';
const variant={id:variantId,product_id:product,created_at:'2026-10-01',size:'M',color:'red',sku:'SKU',price:100,stock_quantity:10};
beforeEach(()=>{vi.resetAllMocks();owner='a3000000-0000-4000-8000-000000000008';vi.mocked(adminProducts.listVariants).mockResolvedValue([variant]);vi.mocked(adminInventoryActions.status).mockResolvedValue({adjustmentsEnabled:true,historyAvailable:true});});
afterEach(()=>cleanup());
async function open(){render(<ProductVariantsManager productId={product}/>);fireEvent.click(await screen.findByRole('button',{name:'اصلاح و تاریخچه'}));await screen.findByLabelText('افزایش یا کاهش موجودی');}
async function preview(){fireEvent.change(screen.getByLabelText('افزایش یا کاهش موجودی'),{target:{value:'-2'}});fireEvent.change(screen.getByLabelText('دلیل اصلاح موجودی'),{target:{value:'count correction'}});fireEvent.click(screen.getByRole('button',{name:'پیش‌نمایش اصلاح موجودی'}));}
it('replaces inline stock writes with preview and a separate audited confirmation',async()=>{
 await open();await preview();expect(adminInventoryActions.adjust).not.toHaveBeenCalled();
 vi.mocked(adminInventoryActions.adjust).mockImplementation(async(actor,target)=>({entry:{id:crypto.randomUUID(),requestId:target.idempotencyKey,actorId:actor,productId:product,variantId,before:10,after:8,delta:-2,reason:target.reason,createdAt:'2026-10-24T01:00:00Z',sku:'SKU',size:'M',color:'red'},recoveryWarning:false}));
 vi.mocked(adminProducts.listVariants).mockResolvedValue([{...variant,stock_quantity:8}]);
 fireEvent.click(screen.getByRole('button',{name:'تأیید و ثبت اصلاح موجودی'}));
 await screen.findByText('اصلاح موجودی تأیید شد: 10 ← 8');
 expect(adminInventoryActions.adjust).toHaveBeenCalledWith(owner,expect.objectContaining({productId:product,variantId,expected:{quantity:10,sku:'SKU',size:'M',color:'red'},delta:-2,reason:'count correction'}),expect.any(Function));
 expect(adminProducts.updateVariantField).not.toHaveBeenCalled();
 await waitFor(()=>expect(adminProducts.listVariants).toHaveBeenCalledTimes(2));
 fireEvent.click(screen.getByRole('button',{name:'بستن'}));expect(await screen.findByText('8')).toBeInTheDocument();
});
it('never exposes the legacy stock number input or a fallback when the server gate is closed',async()=>{
 vi.mocked(adminInventoryActions.status).mockResolvedValue({adjustmentsEnabled:false,historyAvailable:false});
 render(<ProductVariantsManager productId={product}/>);await screen.findByText('10');
 expect(screen.queryByDisplayValue('10')).not.toBeInTheDocument();expect(screen.getByText('شروع با موجودی صفر')).toBeInTheDocument();
 fireEvent.click(screen.getByRole('button',{name:'اصلاح و تاریخچه'}));await screen.findByText('اصلاح موجودی هنوز فعال نشده است.');
 expect(screen.queryByLabelText('افزایش یا کاهش موجودی')).not.toBeInTheDocument();expect(adminProducts.updateVariantField).not.toHaveBeenCalled();
});
it('keeps the receipt dialog mounted during refresh rather than losing a confirmed result',async()=>{
 await open();await preview();let finish!:(value:typeof variant[])=>void;
 vi.mocked(adminProducts.listVariants).mockImplementationOnce(()=>new Promise(resolve=>{finish=resolve;}));
 vi.mocked(adminInventoryActions.adjust).mockImplementation(async(actor,target)=>({entry:{id:crypto.randomUUID(),requestId:target.idempotencyKey,actorId:actor,productId:product,variantId,before:10,after:8,delta:-2,reason:target.reason,createdAt:'2026-10-24T01:00:00Z',sku:'SKU',size:'M',color:'red'},recoveryWarning:false}));
 fireEvent.click(screen.getByRole('button',{name:'تأیید و ثبت اصلاح موجودی'}));await screen.findByText('اصلاح موجودی تأیید شد: 10 ← 8');
 await screen.findByText('در حال بازخوانی تنوع‌ها…');expect(screen.getByPlaceholderText('سایز جدید')).toBeDisabled();
 await act(async()=>{finish([{...variant,stock_quantity:8}]);});expect(screen.getByText('اصلاح موجودی تأیید شد: 10 ← 8')).toBeInTheDocument();
});
it('locks identity edits and deletion while an adjustment snapshot is open',async()=>{
 await open();expect(screen.getByDisplayValue('M')).toBeDisabled();expect(screen.getByDisplayValue('SKU')).toBeDisabled();
 fireEvent.click(screen.getByRole('button',{name:'بستن'}));expect(screen.getByDisplayValue('M')).toBeEnabled();
});
it('waits for queued identity writes before allowing an inventory snapshot',async()=>{
 let finish!:()=>void;vi.mocked(adminProducts.updateVariantField).mockImplementationOnce(()=>new Promise(resolve=>{finish=resolve;}));
 render(<ProductVariantsManager productId={product}/>);fireEvent.change(await screen.findByDisplayValue('M'),{target:{value:'L'}});
 expect(screen.getByRole('button',{name:'اصلاح و تاریخچه'})).toBeDisabled();
 await waitFor(()=>expect(adminProducts.updateVariantField).toHaveBeenCalled());await act(async()=>finish());
 fireEvent.click(screen.getByRole('button',{name:'اصلاح و تاریخچه'}));await screen.findByLabelText('افزایش یا کاهش موجودی');await preview();
 expect(screen.getByText('قبل: 10؛ تغییر: -2؛ بعد: 8')).toBeInTheDocument();expect(adminProducts.updateVariantField).toHaveBeenCalledWith(variantId,'size','L');
});
it('drops the old adjustment form when the signed-in owner changes',async()=>{
 const view=render(<ProductVariantsManager productId={product}/>);fireEvent.click(await screen.findByRole('button',{name:'اصلاح و تاریخچه'}));await screen.findByLabelText('افزایش یا کاهش موجودی');
 owner='a3000000-0000-4000-8000-000000000009';await act(async()=>{view.rerender(<ProductVariantsManager productId={product}/>);});
 expect(screen.queryByLabelText('افزایش یا کاهش موجودی')).not.toBeInTheDocument();expect(adminInventoryActions.adjust).not.toHaveBeenCalled();
});
