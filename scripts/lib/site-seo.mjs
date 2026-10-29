import {escapeHtml} from '../../server/public-product-html.js';
import {siteOrigin} from './site-health.mjs';
import {SITE_ORIGIN,PUBLIC_PAGES,routeSeo} from '../../config/seo.js';

// Intentionally accepts only our generated, flat sitemap dialect. No entities,
// external references, nested sitemap crawling or arbitrary destinations.
export function inspectSitemap(xml){
 if(typeof xml!=='string'||xml.length>2097152||/<!/i.test(xml))throw Error('invalid_sitemap');
 const body=xml.trim().replace(/^<\?xml[^?]*\?>\s*/,'');
 const root=body.match(/^<urlset\s+xmlns=["']http:\/\/www\.sitemaps\.org\/schemas\/sitemap\/0\.9["']\s*>([\s\S]*)<\/urlset>$/);if(!root)throw Error('invalid_sitemap');
 const urls=[];let rest=root[1];
 rest=rest.replace(/<url>\s*<loc>([^<]+)<\/loc>\s*<\/url>/g,(_all,value)=>{if(value.includes('&'))throw Error('invalid_sitemap');urls.push(value.trim());return '';});
 if(rest.trim()||urls.length>10013||!urls.length||new Set(urls).size!==urls.length)throw Error('invalid_sitemap');
 for(const raw of urls){const u=new URL(raw);if(u.origin!==SITE_ORIGIN||u.username||u.password||u.search||u.hash||routeSeo(u.pathname).canonical!==raw)throw Error('invalid_sitemap');}
 for(const p of Object.keys(PUBLIC_PAGES))if(!urls.includes(SITE_ORIGIN+p))throw Error('missing_public_page');
 return {urls,product:urls.find(u=>new URL(u).pathname.startsWith('/product/'))};
}
function attributes(tag){const values={};for(const match of tag.matchAll(/([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)){const key=match[1].toLowerCase();if(Object.hasOwn(values,key))throw Error('duplicate_attribute');values[key]=match[2]??match[3];}return values;}
export function inspectHtml(html,{canonical,privatePage=false,product=false}={}){
 const head=html.match(/<head\b[^>]*>([\s\S]*?)<\/head>/i)?.[1];if(!head)throw Error('missing_head');
 const title=[...head.matchAll(/<title\b[^>]*>([\s\S]*?)<\/title>/gi)];if(title.length!==1||!title[0][1].trim())throw Error('invalid_title');
 const tags=[...head.matchAll(/<(meta|link)\b(?:[^>"']|"[^"]*"|'[^']*')*>/gi)].map(m=>({kind:m[1].toLowerCase(),...attributes(m[0])}));
 const descriptions=tags.filter(t=>t.kind==='meta'&&t.name==='description');if(descriptions.length!==1||!descriptions[0].content?.trim())throw Error('invalid_description');
 const robots=tags.filter(t=>t.kind==='meta'&&t.name==='robots');if(robots.length!==1||robots[0].content!==(privatePage?'noindex, follow':'index, follow'))throw Error('invalid_robots');
 const canonicals=tags.filter(t=>t.kind==='link'&&t.rel==='canonical'),ogUrls=tags.filter(t=>t.kind==='meta'&&t.property==='og:url');
 if(privatePage){if(canonicals.length||ogUrls.length)throw Error('private_canonical');}
 else if(canonicals.length!==1||canonicals[0].href!==canonical||ogUrls.length!==1||ogUrls[0].content!==canonical)throw Error('invalid_canonical');
 if(product){const scripts=[...head.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)].filter(m=>attributes(m[1]).type==='application/ld+json');if(scripts.length!==2)throw Error('invalid_product_data');const objects=scripts.map(m=>JSON.parse(m[2]));const products=objects.filter(x=>x?.['@type']==='Product'),trails=objects.filter(x=>x?.['@type']==='BreadcrumbList');if(products.length!==1||trails.length!==1)throw Error('invalid_product_data');const data=products[0];const price=html.match(/<p\b[^>]*data-product-price[^>]*>([\s\S]*?)<\/p>/i)?.[1],stock=html.match(/<p\b[^>]*data-product-availability[^>]*>([\s\S]*?)<\/p>/i)?.[1];if(price!==Number(data.offers?.price).toLocaleString('fa-IR')+' ریال'||stock!==(data.offers?.availability==='https://schema.org/OutOfStock'?'ناموجود':'موجود'))throw Error('invalid_product_content');const heading=html.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i)?.[1];if(!html.includes('data-public-product-summary')||heading!==escapeHtml(data.name))throw Error('invalid_product_content');const items=trails[0].itemListElement;if(!Array.isArray(items)||items.length!==3||items.some((x,i)=>x?.['@type']!=='ListItem'||x.position!==i+1||x.item!==[SITE_ORIGIN+'/',SITE_ORIGIN+'/shop',canonical][i]||x.name!==['خانه','فروشگاه',data.name][i]))throw Error('invalid_product_data');if(data['@type']!=='Product'||typeof data.name!=='string'||!data.name.trim()||data.offers?.url!==canonical||data.offers?.priceCurrency!=='IRR'||!Number.isFinite(Number(data.offers.price))||Number(data.offers.price)<=0||!['https://schema.org/InStock','https://schema.org/OutOfStock'].includes(data.offers.availability))throw Error('invalid_product_data');}
 return true;
}
async function boundedText(response,limit){const reader=response.body?.getReader();if(!reader)throw Error('empty_body');let size=0;const chunks=[];try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>limit){await reader.cancel();throw Error('body_limit');}chunks.push(value);}return Buffer.concat(chunks).toString('utf8');}finally{reader.releaseLock();}}
export async function checkSiteSeo(raw,{send=fetch,timeoutMs=6000}={}){
 const origin=siteOrigin(raw),checks=[];let sitemap;
 async function probe(name,pathname,validate,{status=200,limit=262144,type='text/html'}={}){
  const controller=new AbortController();let timer;let httpStatus=null;
  const job=(async()=>{const response=await send(origin+pathname,{method:'GET',headers:{accept:type},credentials:'omit',redirect:'error',cache:'no-store',signal:controller.signal});httpStatus=response.status;if(response.status!==status){await response.body?.cancel();throw Error('http_status');}if(!response.headers.get('content-type')?.toLowerCase().includes(type)){await response.body?.cancel();throw Error('content_type');}const text=await boundedText(response,limit);return validate(text,response);})();
  try{await Promise.race([job,new Promise((_resolve,reject)=>{timer=setTimeout(()=>{controller.abort();reject(Error('timeout'));},timeoutMs);})]);checks.push({name,ok:true,status:httpStatus,reason:'ok'});}catch(error){const allowed=['timeout','http_status','content_type','body_limit','empty_body','invalid_sitemap','missing_public_page','missing_head','invalid_title','invalid_description','invalid_robots','private_canonical','invalid_canonical','invalid_product_data','invalid_product_content','private_header','robots_policy'];checks.push({name,ok:false,status:httpStatus,reason:allowed.includes(error?.message)?error.message:'unavailable'});}finally{clearTimeout(timer);controller.abort();}
 }
 await probe('robots','/robots.txt',text=>{const lines=text.split(/\r?\n/).map(l=>l.replace(/#.*/,'').trim()).filter(Boolean);if(!lines.some(l=>/^Sitemap:\s*https:\/\/jamimode\.ir\/sitemap\.xml$/i.test(l)))throw Error('robots_policy');let active=false,seen=false;for(const line of lines){if(/^User-agent:/i.test(line)){active=/^User-agent:\s*\*$/i.test(line);seen||=active;}else if(active&&/^Disallow:\s*\/$/i.test(line))throw Error('robots_policy');}if(!seen)throw Error('robots_policy');},{type:'text/plain',limit:32768});
 await probe('sitemap','/sitemap.xml',text=>{sitemap=inspectSitemap(text);},{type:'application/xml',limit:2097152});
 for(const [name,p]of [['home','/'],['shop','/shop']])await probe(name,p,text=>inspectHtml(text,{canonical:SITE_ORIGIN+p}));
 await probe('account','/account',(text,response)=>{if(response.headers.get('x-robots-tag')!=='noindex, follow')throw Error('private_header');inspectHtml(text,{privatePage:true});});
 await probe('missing_page','/__seo_missing_page__',text=>inspectHtml(text,{privatePage:true}),{status:404});
 if(sitemap?.product)await probe('product_sample',new URL(sitemap.product).pathname,text=>inspectHtml(text,{canonical:sitemap.product,product:true}));
 else checks.push({name:'product_sample',ok:false,status:null,reason:'no_product_sample'});
 return {result:checks.every(c=>c.ok)?'ok':'needs_review',readOnly:true,sampledProducts:sitemap?.product?1:0,sitemapUrls:sitemap?.urls.length??0,checks};
}
