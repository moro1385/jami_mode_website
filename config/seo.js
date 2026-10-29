import {COLLECTIONS} from './collections.js';
export const SITE_ORIGIN = 'https://jamimode.ir';
export const PUBLIC_PAGES = {
 '/':'فروشگاه اینترنتی جوراب، لباس زیر و لباس راحتی', '/shop':'فروشگاه',
 '/about':'درباره ما', '/contact':'ارتباط با ما', '/faq':'پرسش‌های متداول',
 '/size-guide':'راهنمای سایز', '/return-policy':'شرایط بازگشت کالا',
 '/privacy-policy':'حریم خصوصی', '/terms':'شرایط استفاده', '/wholesale':'خرید عمده',
 '/address':'نشانی فروشگاه', '/collections/core':COLLECTIONS.core.title,
 '/collections/sets-and-pairs':COLLECTIONS.essentials.title,
};
export const DEFAULT_DESCRIPTION = 'خرید آنلاین جوراب، لباس زیر و لباس راحتی مردانه، زنانه و بچگانه از جامی مد.';
export function productPath(slug) {
 if(typeof slug!=='string'||!slug.trim()||slug!==slug.trim()||slug.length>300||/[\u0000-\u001f\u007f/\\?#]/u.test(slug)||['.','..'].includes(slug)) return null;
 return '/product/'+encodeURIComponent(slug);
}
export function routeSeo(pathname) {
 let path=pathname;
 if(typeof path!=='string'||!path.startsWith('/')||path.includes('?')||path.includes('#')) return {canonical:null,indexable:false,title:'جامی مد'};
 if(path.length>1)path=path.replace(/\/+$/,'');
 if(Object.hasOwn(PUBLIC_PAGES,path))return {canonical:SITE_ORIGIN+path,indexable:true,title:PUBLIC_PAGES[path]};
 if(path.startsWith('/product/')) {
  try {const product=productPath(decodeURIComponent(path.slice(9)));if(product)return {canonical:SITE_ORIGIN+product,indexable:true,title:'محصول'};}catch{/* Invalid URL encoding is not a public product. */}
 }
 return {canonical:null,indexable:false,title:'جامی مد'};
}
// Only public image URLs, never signed URLs, credentials or arbitrary schemes.
export function publicSeoImage(value) {
 if(typeof value!=='string'||!value||value.startsWith('//'))return undefined;
 try {
  const url=new URL(value,SITE_ORIGIN);
  if(url.protocol!=='https:'||url.username||url.password||url.search||url.hash)return undefined;
  if(url.pathname.includes('/placeholder.')||/\/storage\/v1\/(object|render)\/(?!public\/)/.test(url.pathname))return undefined;
  return url.href;
 }catch{return undefined;}
}
export function serializeJsonLd(value) {
 return JSON.stringify(value).replace(/</g,'\\u003c').replace(/>/g,'\\u003e').replace(/&/g,'\\u0026').replace(/\u2028/g,'\\u2028').replace(/\u2029/g,'\\u2029');
}
export function productJsonLd({name,description,slug,image,amount,currency,soldOut}) {
 const path=productPath(slug),price=Number(amount),picture=publicSeoImage(image);
 if(!path||typeof name!=='string'||!name.trim())return null;
 return {'@context':'https://schema.org','@type':'Product',name,description,
  ...(picture?{image:[picture]}:{}),
  ...(typeof amount==='string'&&amount.trim()&&Number.isFinite(price)&&price>0&&currency==='IRR'?{offers:{'@type':'Offer',price:amount,priceCurrency:'IRR',availability:'https://schema.org/'+(soldOut?'OutOfStock':'InStock'),url:SITE_ORIGIN+path}}:{}),
 };
}

export const PAGE_DESCRIPTIONS = {
 "/": "فروشگاه اینترنتی جوراب، لباس زیر، زیرپوش و لباس راحتی — ارسال سریع و کیفیت مطمئن.",
 "/shop": "مشاهده تمام محصولات جامی مد",
 "/about": "داستان ما از یک فروشگاه کوچکی در سال ۱۳۷۵ در بازار بزرگ تبریز آغاز شد.",
 "/contact": "با تیم پشتیبانی جامی مد در ارتباط باشید.",
 "/faq": "پاسخ سوالات پرتکرار مشتریان جامی مد.",
 "/size-guide": "راهنمای انتخاب سایز جوراب، لباس زیر و پوشاک در جامی مد.",
 "/return-policy": "شرایط و مراحل درخواست بازگشت کالا در فروشگاه جامی مد را بخوانید.",
 "/privacy-policy": "نحوهٔ استفاده و نگهداری اطلاعات شخصی در فروشگاه جامی مد را بخوانید.",
 "/terms": "شرایط استفاده از سایت و خرید از فروشگاه جامی مد را بخوانید.",
 "/wholesale": "اطلاعات خرید عمده و ارتباط با فروشگاه جامی مد برای سفارش عمده.",
 "/address": "نشانی فروشگاه جامی مد و اطلاعات مراجعه و ارتباط با فروشگاه.",
 "/collections/core": COLLECTIONS.core.description,
 "/collections/sets-and-pairs": COLLECTIONS.essentials.description
};
export function routeDescription(pathname) {
 const path=typeof pathname==='string'&&pathname.length>1?pathname.replace(/\/+$/,''):pathname;
 return PAGE_DESCRIPTIONS[path] || DEFAULT_DESCRIPTION;
}

export function productBreadcrumbs({name,slug}) {
 const path=productPath(slug);if(!path||typeof name!=='string'||!name.trim())return null;
 return {'@context':'https://schema.org','@type':'BreadcrumbList',itemListElement:[
  {'@type':'ListItem',position:1,name:'خانه',item:SITE_ORIGIN+'/'},
  {'@type':'ListItem',position:2,name:'فروشگاه',item:SITE_ORIGIN+'/shop'},
  {'@type':'ListItem',position:3,name,item:SITE_ORIGIN+path},
 ]};
}
