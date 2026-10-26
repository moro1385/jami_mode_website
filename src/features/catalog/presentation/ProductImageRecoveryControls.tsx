import {supabaseAssetUrl} from '@/lib/supabaseRelay';
import { useCallback, useState } from 'react';
import type { AdminProduct } from '../domain/adminProducts';
import { adminProductImageRecovery } from '../admin';
import { useScopedAsyncRead } from '@/shared/presentation/useScopedAsyncRead';
import { useRequestScope } from '@/shared/presentation/useRequestScope';
import { ReadFailure } from '@/shared/presentation/ReadFailure';
import { Button } from '@/components/ui/button';
import type { ProductGallerySnapshot } from '../application/productImageRecovery';
function GalleryPhotos({ gallery }: { gallery: ProductGallerySnapshot }) {
 const mainActive = gallery.main.length > 0;
 return <div className="space-y-2"><p>{mainActive ? 'نمایش فعلی از فهرست اصلی است؛ گالری قدیمی زیر در اولویت نمایش نیست.' : 'فهرست اصلی خالی است؛ نمایش فعلی از گالری قدیمی است.'}</p>
  <p>فهرست اصلی: {gallery.main.length} عکس</p><div className="flex flex-wrap gap-2">{gallery.main.map((url,index)=><img key={index} src={supabaseAssetUrl(url)} alt={'اصلی '+(index+1)} loading="lazy" referrerPolicy="no-referrer" className="w-20 h-20 object-cover rounded"/>)}</div>
  <p>گالری قدیمی: {gallery.legacy.length} عکس</p><div className="flex flex-wrap gap-2">{gallery.legacy.map((image,index)=><img key={image.id} src={supabaseAssetUrl(image.url)} alt={'قدیمی '+(index+1)} loading="lazy" referrerPolicy="no-referrer" className="w-20 h-20 object-cover rounded"/>)}</div>
  {!gallery.main.length && !gallery.legacy.length && <p>عکسی در این دو فهرست ثبت نشده است.</p>}
 </div>;
}
function ProductGallery({ product, ownerId, busy }: { product: AdminProduct; ownerId?: string; busy: boolean }) {
 const [open,setOpen] = useState(false);
 const load = useCallback(()=>adminProductImageRecovery.readGallery(product.id),[product.id]);
 const read=useScopedAsyncRead(open && ownerId ? ownerId+':'+product.id : undefined,load);
 return <div className="border rounded p-3 space-y-2"><Button variant="outline" disabled={busy} aria-expanded={open} onClick={()=>setOpen(value=>!value)}>مشاهده گالری فعلی و قدیمی {product.name}</Button>
  {open && (read.loading ? <p role="status">در حال خواندن گالری…</p> : read.error ? <ReadFailure retry={read.retry} message="خواندن گالری ممکن نشد."/> : read.value ? <GalleryPhotos gallery={read.value}/> : null)}
 </div>;
}
export function ProductImageRecoveryControls({ selected, ownerId, busy }: { selected: AdminProduct[]; ownerId?: string; busy: boolean }) {
 const [open,setOpen]=useState(false), [error,setError]=useState(''), [pending,setPending]=useState(false), [results,setResults]=useState<Record<string,string>>({});
 const capture=useRequestScope(ownerId);
 const load=useCallback(async()=>ownerId?adminProductImageRecovery.list(ownerId):[],[ownerId]);
 const read=useScopedAsyncRead(open?ownerId:undefined,load), entries=read.value??[];
 async function inspect(path:string) {
  if(!ownerId || pending || busy) return; const current=capture(); setPending(true);setError('');
  try { const result=await adminProductImageRecovery.inspect(ownerId,path); if(current()) setResults(value=>({...value,[path]:result.main?'این فایل در فهرست اصلی محصول ثبت است.':result.legacy?'این فایل در گالری قدیمی محصول ثبت است.':'در این محصول ارتباطی پیدا نشد؛ وجود فایل و استفادهٔ احتمالی در محصولات دیگر هنوز بررسی نشده است.'})); }
  catch { if(current()) setError('بررسی ارتباط فایل تأیید نشد؛ یادداشت حفظ شد.'); }
  finally { if(current()) setPending(false); }
 }
 return <section className="border rounded-xl p-3 space-y-3"><Button variant="outline" disabled={busy || pending} aria-expanded={open} onClick={()=>setOpen(value=>!value)}>گالری قدیمی و بازیابی بارگذاری</Button>
  {open && <>
   <p>یادداشت‌ها فقط در همین مرورگر و برای همین حساب و پروژه نگه داشته می‌شوند؛ پاک‌کردن داده‌های مرورگر آن‌ها را حذف می‌کند. هیچ فایل واقعی از این بخش پاک نمی‌شود.</p>
   <div className="max-h-80 overflow-auto space-y-3">{selected.map(product=><ProductGallery key={product.id} product={product} ownerId={ownerId} busy={busy || pending}/>)}</div>
   <Button variant="outline" disabled={busy || pending || read.loading} onClick={()=>{setResults({});read.retry();}}>بازخوانی یادداشت‌های بازیابی</Button>
   {read.loading?<p role="status">در حال خواندن یادداشت‌ها…</p>:read.error?<ReadFailure retry={read.retry} message="خواندن یادداشت‌ها ممکن نشد؛ برای جلوگیری از گم‌شدن مسیر فایل، بارگذاری تازه شروع نکنید."/>:<>
    <p role="status">{entries.length} یادداشت نیازمند بررسی در این مرورگر</p>
    {entries.length>0 && <details><summary>نسخهٔ قابل کپی گزارش بازیابی</summary><textarea aria-label="گزارش بازیابی قابل کپی" readOnly dir="ltr" className="w-full h-40 border" value={JSON.stringify(entries,null,2)}/></details>}
    <ul className="space-y-3">{entries.map(entry=><li key={entry.path} className="border rounded p-3 space-y-2"><code dir="ltr" className="break-all">{entry.path}</code><p>وضعیت: {entry.state==='linked'?'اتصال قبلاً تأیید شده':entry.state==='upload-unconfirmed'?'ارسال تأییدنشده':entry.state==='uploaded-unlinked'?'ارسال‌شده؛ اتصال ثبت نشده':'نتیجهٔ اتصال تأییدنشده'}</p>
     <Button variant="outline" disabled={busy || pending} onClick={()=>void inspect(entry.path)}>بررسی ارتباط فایل با محصول</Button>
     {results[entry.path] && <p role="status">{results[entry.path]}</p>}
     <Button variant="outline" disabled={busy || pending} onClick={()=>{if(!ownerId)return;try{adminProductImageRecovery.forget(ownerId,entry.path);setResults({});read.retry();}catch{setError('بستن یادداشت انجام نشد.');}}}>بستن یادداشت پس از بررسی دستی</Button>
    </li>)}</ul>
   </>}
   {error && <p role="alert">{error}</p>}
  </>}
 </section>;
}
