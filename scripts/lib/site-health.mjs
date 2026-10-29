import {publicSupabaseConfig} from '../../config/supabase-public.js';
export function siteOrigin(raw='https://jamimode.ir') {
  const url=new URL(raw);
  if(url.username||url.password||url.search||url.hash||url.pathname!=='/'||!((url.protocol==='https:'&&['jamimode.ir','www.jamimode.ir'].includes(url.hostname)&&!url.port)||(url.protocol==='http:'&&url.hostname==='127.0.0.1'&&['3000','8080','4180'].includes(url.port))))throw Error('Unsupported origin');
  return url.origin;
}
async function boundedJson(response){
  if(!response.headers.get('content-type')?.toLowerCase().includes('application/json')){await response.body?.cancel();throw Error('Invalid JSON');}
  const reader=response.body?.getReader();if(!reader)throw Error('Empty response');
  const chunks=[];let size=0;
  try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>32768){await reader.cancel();throw Error('Response too large');}chunks.push(value);}}
  finally{reader.releaseLock();}
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}
export async function checkSiteHealth(raw,{send=fetch,timeoutMs=10000,clock=()=>performance.now()}={}){
  const origin=siteOrigin(raw),{key}=publicSupabaseConfig({MODE:'production'});
  const probes=[['live','/api/health/live'],['maintenance','/api/health/maintenance'],['supabase','/api/supabase/auth/v1/health']];
  const checks=await Promise.all(probes.map(async([name,path])=>{
    const start=clock(),signal=AbortSignal.timeout(timeoutMs);let status=null,reason='network_error';
    try{
      const response=await send(origin+path,{method:'GET',headers:{accept:'application/json',...(name==='supabase'?{apikey:key}:{})},credentials:'omit',cache:'no-store',redirect:'error',signal});
      status=response.status;
      if(!response.ok){reason='http_error';await response.body?.cancel();}
      else{reason='invalid_response';const data=await boundedJson(response);if(data&&typeof data==='object'&&!Array.isArray(data)&&(name==='supabase'||data.status==='ok'))reason='ok';}
    }catch{if(signal.aborted)reason='timeout';}
    const elapsed=clock()-start;
    return {name,ok:reason==='ok',status,reason,durationMs:Number.isFinite(elapsed)?Math.max(0,Math.min(86400000,Math.round(elapsed))):0};
  }));
  return {result:checks.every(c=>c.ok)?'ok':checks.some(c=>c.ok)?'degraded':'unavailable',readOnly:true,checks};
}
