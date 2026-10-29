import {escapeHtml,renderPublicProductHtml} from './public-product-html.js';
import {routeSeo,routeDescription,publicSeoImage,productJsonLd,productBreadcrumbs,serializeJsonLd} from '../config/seo.js';
const privatePages=new Set(['/cart','/order-tracking','/signin','/signin/otp','/signin/otp/verify','/signup','/account','/account/addresses','/account/wallet','/account/wallet/verify','/account/orders','/account/messages','/account/returns/new','/checkout','/checkout/payment','/checkout/verify','/checkout/success','/checkout/failed','/admin','/admin/products','/admin/erp','/admin/inventory','/admin/orders','/admin/users','/admin/tickets','/admin/messages','/admin/return-requests']);
const escape=escapeHtml;
export async function pageSeo(pathname,readProduct){
 const path=pathname==='/index.html'?'/':pathname.length>1?pathname.replace(/\/+$/,''):pathname;
 const policy=routeSeo(path);let status=policy.indexable||privatePages.has(path)?200:404;
 let title=status===404?'صفحه پیدا نشد':policy.title,description=routeDescription(path),picture,schema,breadcrumbs,publicProduct;
 if(policy.indexable&&path.startsWith('/product/')){
  let result;try{result=await readProduct(decodeURIComponent(path.slice(9)));}catch{result={state:'unavailable'};}
  if(result?.state==='found'){
   const product=result.product;publicProduct=product;title=product.name;
   description=product.description?product.description.length>155?product.description.slice(0,155)+'...':product.description:'خرید از جامی مد';
   picture=publicSeoImage(product.image);schema=productJsonLd({...product,currency:'IRR'});breadcrumbs=productBreadcrumbs(product);
  }else{status=result?.state==='missing'?404:503;title=status===404?'محصول پیدا نشد':'دریافت اطلاعات محصول موقتاً ممکن نیست';}
 }
 const indexable=policy.indexable&&status===200;
 return {status,indexable,pageTitle:title,publicProduct,title:title+' | جامی مد',description,canonical:indexable?policy.canonical:null,picture,schema,breadcrumbs};
}
export function renderPageSeo(html,meta){
 // Only replace the controlled template's managed SEO tags. Preserve verification,
 // icons, font preload, bundles, CSP and the SPA root without rendering private data.
 const clean=html.replace(/<title\b[^>]*>[\s\S]*?<\/title>/gi,'').replace(/<meta\b[^>]*data-rh=["']true["'][^>]*>/gi,'');
 const tag=(name,value,property=false)=>'<meta data-rh="true" '+(property?'property':'name')+'="'+name+'" content="'+escape(value)+'">';
 const tags=['<title data-rh="true">'+escape(meta.title)+'</title>',tag('description',meta.description),tag('robots',meta.indexable?'index, follow':'noindex, follow'),tag('og:type','website',true),tag('og:title',meta.title,true),tag('og:description',meta.description,true),tag('twitter:card',meta.picture?'summary_large_image':'summary'),tag('twitter:title',meta.title),tag('twitter:description',meta.description)];
 if(meta.canonical)tags.push('<link data-rh="true" rel="canonical" href="'+escape(meta.canonical)+'">',tag('og:url',meta.canonical,true));
 if(meta.picture)tags.push(tag('og:image',meta.picture,true),tag('twitter:image',meta.picture));
 if(meta.schema)tags.push('<script data-rh="true" id="product-structured-data" type="application/ld+json">'+serializeJsonLd(meta.schema)+'</script>');
 if(meta.breadcrumbs)tags.push('<script data-rh="true" id="product-breadcrumbs" type="application/ld+json">'+serializeJsonLd(meta.breadcrumbs)+'</script>');
 const output=clean.replace(/<\/head>/i,()=>tags.join('\n')+'\n</head>');
 const summary=renderPublicProductHtml(meta);
 return summary?output.replace(/<div id=["']root["']>\s*<\/div>/,()=>'<div id="root">'+summary+'</div>'):output;
}
