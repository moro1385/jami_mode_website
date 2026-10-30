import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {createServer} from 'node:http';
import express from 'express';
import {createStorefrontStatic} from '../server/storefront-static.js';
import {deliveryAssets,checkSiteDelivery} from './lib/site-delivery.mjs';

// Fixed disposable loopback listener: no configurable target, APIs or database.
const root=fileURLToPath(new URL('../dist/',import.meta.url));
const app=express(),server=createServer(app);
const percentile=(values,fraction)=>{const sorted=[...values].sort((a,b)=>a-b);return Math.round(sorted[Math.max(0,Math.ceil(sorted.length*fraction)-1)]*100)/100;};
let report;
try{
 if(process.argv.length!==2)throw Error('Invalid arguments');
 const html=await readFile(new URL('../dist/index.html',import.meta.url),'utf8');
 const assets=deliveryAssets(html,'https://jamimode.ir');
 app.use(createStorefrontStatic(root));
 await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
 const address=server.address();if(!address||typeof address==='string')throw Error('No listener');
 const origin='http://127.0.0.1:'+address.port;
 const baseline=await checkSiteDelivery(undefined,{send:(url,options)=>fetch(origin+new URL(url).pathname,options)});
 if(baseline.result!=='ok')throw Error('Invalid static baseline');
 const routes=[['home','/',200],['account','/account',200],['javascript',assets[0],200],['stylesheet',assets[1],200],['missing_asset','/assets/__capacity_probe_missing__.js',404]];
 const results=[];let cursor=0;
 const started=performance.now();
 async function worker(){
  while(cursor<100){
   const index=cursor++, [name,route,status]=routes[index%routes.length],start=performance.now();
   let ok=false,bytes=0;
   try{
    const response=await fetch(origin+route,{redirect:'error',credentials:'omit',signal:AbortSignal.timeout(5000)});
    const reader=response.body?.getReader();
    try{if(reader)while(true){const {done,value}=await reader.read();if(done)break;bytes+=value.byteLength;if(bytes>5_000_000){await reader.cancel();throw Error('Oversized response');}}}
    finally{reader?.releaseLock();}
    ok=response.status===status;
   }catch{ok=false;}
   results.push({name,ok,bytes,durationMs:performance.now()-start});
  }
 }
 await Promise.all(Array.from({length:4},worker));
 const durationMs=performance.now()-started;
 report={result:results.every(r=>r.ok)?'ok':'needs_review',scope:'local_static_only',productionCapacityVerified:false,externalRequests:0,concurrency:4,requests:results.length,failures:results.filter(r=>!r.ok).length,durationMs:Math.round(durationMs),requestsPerSecond:Math.round(results.length/durationMs*10000)/10,transferredBytes:results.reduce((sum,r)=>sum+r.bytes,0),routes:routes.map(([name])=>{
  const rows=results.filter(r=>r.name===name),values=rows.map(r=>r.durationMs);
  return {name,samples:rows.length,failures:rows.filter(r=>!r.ok).length,p50Ms:percentile(values,.5),p95Ms:percentile(values,.95),maxMs:percentile(values,1)};
 })};
}catch{report={result:'unavailable',scope:'local_static_only',productionCapacityVerified:false,reason:'build_or_local_probe_failed'};}
finally{server.closeAllConnections();await new Promise(resolve=>server.close(()=>resolve()));}
console.log(JSON.stringify(report));process.exitCode=report.result==='ok'?0:1;
