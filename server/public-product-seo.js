import {publicSupabaseConfig} from '../config/supabase-public.js';
import {relayOrigin} from './supabase-relay.js';
import {productPath} from '../config/seo.js';
const defaultPublicConfig=publicSupabaseConfig({MODE:'production'});
export function createPublicProductSeoReader({publicConfig:inputConfig=defaultPublicConfig,send=fetch,now=Date.now,timeoutMs=2500}={}){
 const publicConfig=publicSupabaseConfig({MODE:'production',VITE_SUPABASE_URL:inputConfig.url,VITE_SUPABASE_PUBLISHABLE_KEY:inputConfig.key});
 relayOrigin(publicConfig.url);
 const cache=new Map(),pending=new Map();let active=0;
 return async slug=>{
  if(!productPath(slug))return {state:'missing'};
  const hit=cache.get(slug);if(hit&&hit.until>now())return hit.value;
  cache.delete(slug);if(pending.has(slug))return pending.get(slug);
  if(active>=8)return {state:'unavailable'};
  active++;
  const task=(async()=>{
   const controller=new AbortController();let timer;
   try{
    const job=(async()=>{
     const url=new URL('/rest/v1/products',publicConfig.url);
     url.search=new URLSearchParams({select:'slug,name,description,price,is_out_of_stock,images,product_images(image_url,sort_order)',slug:'eq.'+slug,is_active:'eq.true',limit:'1'}).toString();
     const response=await send(url.href,{method:'GET',headers:{apikey:publicConfig.key,accept:'application/json'},credentials:'omit',redirect:'error',signal:controller.signal});
     if(!response.ok||!response.headers.get('content-type')?.includes('application/json')||!response.body)throw Error();
     const reader=response.body.getReader(),parts=[];let size=0;
     try{while(true){const chunk=await reader.read();if(chunk.done)break;size+=chunk.value.length;if(size>131072){await reader.cancel();throw Error();}parts.push(Buffer.from(chunk.value));}}finally{reader.releaseLock();}
     const rows=JSON.parse(Buffer.concat(parts).toString('utf8'));
     if(!Array.isArray(rows)||rows.length>1)throw Error();if(!rows.length)return {state:'missing'};
     const row=rows[0];
     if(row.slug!==slug||typeof row.name!=='string'||!row.name.trim()||row.name.length>1500||!(row.description==null||typeof row.description==='string'&&row.description.length<=20000)||typeof row.is_out_of_stock!=='boolean')throw Error();
     if(row.price!==null&&(!['string','number'].includes(typeof row.price)||!Number.isFinite(Number(row.price))||Number(row.price)<0))throw Error();
     const images=Array.isArray(row.images)?row.images.filter(item=>typeof item==='string'):[];
     const legacy=Array.isArray(row.product_images)?row.product_images.filter(item=>typeof item?.image_url==='string').sort((a,b)=>(a.sort_order??0)-(b.sort_order??0)):[];
     let image=images[0]??legacy[0]?.image_url;
     if(image){try{const value=new URL(image);if(value.origin===publicConfig.url&&value.pathname.startsWith('/storage/v1/object/public/product-images/'))image='/api/supabase'+value.pathname+value.search;}catch{/* Local public assets stay local. */}}
     return {state:'found',product:{slug,name:row.name,description:row.description??'',amount:String(row.price??0),soldOut:row.is_out_of_stock,image}};
    })();
    const timedOut=new Promise((_,reject)=>{timer=setTimeout(()=>{controller.abort();reject(Error());},timeoutMs);});
    const value=await Promise.race([job,timedOut]);
    if(cache.size>=200)cache.delete(cache.keys().next().value);
    cache.set(slug,{value,until:now()+(value.state==='found'?30000:10000)});return value;
   }catch{return {state:'unavailable'};}finally{clearTimeout(timer);active--;pending.delete(slug);}
  })();pending.set(slug,task);return task;
 };
}
