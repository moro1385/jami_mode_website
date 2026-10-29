import {randomUUID} from 'node:crypto';
const methods=new Set(['GET','HEAD','POST','PUT','PATCH','DELETE','OPTIONS']);
// Fixed families only. Never persist URLs, query strings, identifiers or payloads.
export function requestFamily(value) {
  const path=typeof value==='string'?value.split('?')[0]:'';
  for(const [prefix,family] of [
    ['/api/supabase/auth/v1','auth'],['/api/supabase/rest/v1','data'],['/api/supabase/storage/v1','storage'],
    ['/api/bitpay','checkout'],['/api/wallet','wallet'],['/api/admin/inventory','inventory'],
    ['/api/admin/erp','erp'],['/api/health','health'],['/torob_api/v3','catalog_feed'],
  ])if(path===prefix||path.startsWith(prefix+'/'))return family;
  if(path==='/api'||path.startsWith('/api/'))return 'api_other';
  return null;
}
export function createHttpObservation({write=(line,level)=>console[level](line),now=Date.now,clock=()=>performance.now(),slowMs=2000,maxRecords=60,windowMs=60000}={}) {
  let started=now(),count=0,dropped=0;
  const emit=(record,level)=>{
    const time=now();
    if(time<started||time-started>=windowMs){
      if(dropped)try{write(JSON.stringify({event:'http_observation_suppressed',count:dropped}),'warn');}catch{/* Logging cannot alter an API result. */}
      started=time;count=0;dropped=0;
    }
    if(count>=maxRecords){dropped=Math.min(dropped+1,Number.MAX_SAFE_INTEGER);return;}
    count++;
    try{write(JSON.stringify(record),level);}catch{/* Logging cannot alter an API result. */}
  };
  return (req,res,next)=>{
    const family=requestFamily(req.originalUrl??req.url);if(!family)return next();
    const requestId=randomUUID(),start=clock();let finished=false;
    // Ignore caller-supplied correlation headers; they may contain personal data.
    res.set('X-Request-ID',requestId);
    const record=aborted=>{
      if(finished)return;finished=true;res.off('finish',complete);res.off('close',closed);
      const elapsed=clock()-start,durationMs=Number.isFinite(elapsed)?Math.max(0,Math.min(86400000,Math.round(elapsed))):0;
      const status=aborted?null:res.statusCode;
      if(!aborted&&status<400&&durationMs<slowMs)return;
      emit({event:'http_request',requestId,family,method:methods.has(req.method)?req.method:'OTHER',status,durationMs,outcome:aborted?'aborted':status>=500?'server_error':status>=400?'client_error':'slow'},status>=500?'error':'warn');
    };
    const complete=()=>record(false),closed=()=>record(!res.writableFinished);
    res.once('finish',complete);res.once('close',closed);next();
  };
}
