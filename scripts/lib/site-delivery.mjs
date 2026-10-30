import {siteOrigin} from './site-health.mjs';

const assetPattern=/^\/assets\/[A-Za-z0-9_.-]+-[A-Za-z0-9_-]{8,}\.(js|css)$/;
const attribute=(tag,name)=>tag.match(new RegExp('\\b'+name+'\\s*=\\s*["\x27]([^"\x27]*)["\x27]','i'))?.[1];
export function deliveryAssets(html,origin){
 const scripts=(html.match(/<script\b[^>]*>/gi)??[]).filter(t=>attribute(t,'type')?.toLowerCase()==='module');
 if(scripts.length!==1)throw Error('Invalid entry');
 const styles=(html.match(/<link\b[^>]*>/gi)??[]).filter(t=>attribute(t,'rel')?.toLowerCase()==='stylesheet');
 if(styles.length!==1)throw Error('Invalid stylesheet');
 return [attribute(scripts[0],'src'),attribute(styles[0],'href')].map(value=>{
  if(!value||value.startsWith('//')||value.includes('\\')||/%|[\u0000-\u0020]/.test(value))throw Error('Invalid asset');
  const url=new URL(value,origin);
  if(url.origin!==origin||url.search||url.hash||!assetPattern.test(url.pathname))throw Error('Invalid asset');
  return url.pathname;
 });
}
export function deliveryPolicy(headers,kind){
 const policy=(headers.get('cache-control')??'').toLowerCase().split(',').map(v=>v.trim());
 const directive=name=>policy.some(v=>v===name);
 const maxAge=policy.filter(v=>/^max-age=/.test(v));
 const max= maxAge.length===1&&/^max-age=\d+$/.test(maxAge[0])?Number(maxAge[0].slice(8)):null;
 const age=headers.get('age');
 const edge=(headers.get('cf-cache-status')??'').toUpperCase();
 const override=['cdn-cache-control','cloudflare-cdn-cache-control','surrogate-control'].some(k=>{
  const value=(headers.get(k)??'').toLowerCase();
  return value&&!value.split(',').some(v=>v.trim()==='no-store');
 });
 if(kind==='private')return directive('no-store')&&!directive('public')&&!directive('immutable')&&
  !policy.some(v=>/^(s-maxage|max-age)=/.test(v)&&v.split('=')[1]!=='0')&&!override&&
  !(age!==null&&(!/^\d+$/.test(age)||Number(age)>0))&&!['HIT','STALE','UPDATING','REVALIDATED'].includes(edge);
 if(kind==='asset')return directive('public')&&directive('immutable')&&!directive('no-store')&&!directive('private')&&
  !directive('no-cache')&&max!==null&&max>=31536000&&!headers.has('set-cookie');
 return directive('must-revalidate')&&max===0&&!directive('immutable');
}
async function boundedHtml(response){
 const reader=response.body?.getReader();if(!reader)throw Error('Missing body');
 const chunks=[];let bytes=0;
 try{while(true){const {done,value}=await reader.read();if(done)break;bytes+=value.byteLength;if(bytes>262144){await reader.cancel();throw Error('Oversized HTML');}chunks.push(value);}}
 finally{reader.releaseLock();}
 return Buffer.concat(chunks).toString('utf8');
}
export async function checkSiteDelivery(raw,{send=fetch,timeoutMs=10000}={}){
 const origin=siteOrigin(raw),checks=[];let html;
 async function probe(name,path,kind,status,type,read=false){
  let httpStatus=null,reason='unavailable';
  try{
   const response=await send(origin+path,{method:'GET',credentials:'omit',redirect:'error',cache:'no-store',headers:{accept:type},signal:AbortSignal.timeout(timeoutMs)});
   httpStatus=response.status;reason='http_status';
   if(response.status===status){
    reason='content_type';
    if(status===404||(response.headers.get('content-type')??'').toLowerCase().includes(type)){
     reason=deliveryPolicy(response.headers,kind)?'ok':'cache_policy';
     if(name==='account'&&!(response.headers.get('x-robots-tag')??'').toLowerCase().includes('noindex'))reason='private_indexing';
    }
   }
   try{if(read&&reason==='ok')html=await boundedHtml(response);}
   finally{if(!read||reason!=='ok')await response.body?.cancel();}
  }catch{reason='unavailable';}
  checks.push({name,ok:reason==='ok',status:httpStatus,reason});
 }
 await probe('home','/','private',200,'text/html',true);
 await probe('account','/account','private',200,'text/html');
 await probe('robots','/robots.txt','revalidate',200,'text/plain');
 await probe('missing_asset','/assets/__delivery_probe_missing__.js','private',404,'');
 let assets;
 try{if(!html)throw Error();assets=deliveryAssets(html,origin);}
 catch{checks.push({name:'build_assets',ok:false,status:null,reason:html?'invalid_asset_reference':'no_home_sample'});}
 if(assets){await probe('javascript',assets[0],'asset',200,'javascript');await probe('stylesheet',assets[1],'asset',200,'text/css');}
 return {result:checks.every(c=>c.ok)?'ok':checks.every(c=>c.status===null)?'unavailable':'needs_review',readOnly:true,checks};
}
