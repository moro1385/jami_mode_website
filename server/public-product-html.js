import {publicSeoImage,SITE_ORIGIN} from '../config/seo.js';
export const escapeHtml=value=>String(value).replace(/[&<>"']/g,character=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[character]));
export function renderPublicProductHtml(meta){
 if(meta.status===200&&meta.publicProduct){
  const product=meta.publicProduct,picture=publicSeoImage(product.image);
  let image='';if(picture){const url=new URL(picture),src=url.origin===SITE_ORIGIN?url.pathname:picture;image='<img src="'+escapeHtml(src)+'" alt="'+escapeHtml(product.name)+'" width="400" height="500" loading="eager" fetchpriority="high" decoding="async" class="w-full aspect-[4/5] object-cover rounded-2xl">';}
  const amount=Number(product.amount),price=Number.isFinite(amount)&&amount>=0?amount.toLocaleString('fa-IR')+' ریال':null;
  return '<main data-public-product-summary dir="rtl" lang="fa" class="max-w-6xl mx-auto px-6 py-8">'
   +'<nav aria-label="مسیر راهنما" class="text-sm text-muted-foreground mb-6"><a href="/">خانه</a> <span aria-hidden="true">›</span> <a href="/shop">فروشگاه</a> <span aria-hidden="true">›</span> <span aria-current="page">'+escapeHtml(product.name)+'</span></nav>'
   +'<article class="grid grid-cols-1 lg:grid-cols-2 gap-12">'+(image?'<div>'+image+'</div>':'')+'<div><h1 class="text-2xl md:text-3xl font-bold mb-4">'+escapeHtml(product.name)+'</h1>'
   +(price?'<p data-product-price class="text-2xl mb-6">'+escapeHtml(price)+'</p>':'')
   +'<p data-product-availability class="mb-6">'+(product.soldOut?'ناموجود':'موجود')+'</p>'
   +(product.description?'<p data-product-description class="text-base leading-relaxed mb-8">'+escapeHtml(product.description)+'</p>':'')
   +'<p class="text-sm text-muted-foreground mb-4">گزینه‌های انتخاب و خرید پس از بارگذاری صفحه نمایش داده می‌شوند.</p>'
   +'<noscript><p>برای انتخاب سایز و ثبت سفارش، جاوااسکریپت مرورگر را فعال کنید.</p></noscript>'
   +'<a href="/shop" class="underline underline-offset-4">مشاهدهٔ فروشگاه</a></div></article></main>';
 }
 if(meta.status===404||meta.status===503){const unavailable=meta.status===503;return '<main data-public-page-error dir="rtl" lang="fa" class="max-w-3xl mx-auto px-6 py-20 text-center"><h1 class="text-2xl font-bold mb-4">'+escapeHtml(meta.pageTitle)+'</h1><p class="mb-8">'+(unavailable?'دریافت اطلاعات محصول موقتاً ممکن نیست. کمی بعد دوباره تلاش کنید.':'صفحهٔ مورد نظر در دسترس نیست. محصولات دیگر را در فروشگاه ببینید.')+'</p><a href="/shop" class="underline">مشاهدهٔ فروشگاه</a></main>';}
 return '';
}
