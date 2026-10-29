import {Readable} from 'node:stream';
import {createInterface} from 'node:readline';
const families=['auth','data','storage','checkout','wallet','inventory','erp','health','catalog_feed','api_other'];
const outcomes=['server_error','client_error','slow','aborted'];
const methods=['GET','HEAD','POST','PUT','PATCH','DELETE','OPTIONS','OTHER'];
const maintenance=['healthy','never_run','stale','unavailable'];
const exact=(v,keys)=>v&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).length===keys.length&&keys.every(k=>Object.hasOwn(v,k));
const count=(v)=>Number.isSafeInteger(v)&&v>=0;
const recordKeys=['event','requestId','family','method','status','durationMs','outcome'];
function validRequest(v){
  if(!exact(v,recordKeys)||typeof v.requestId!=='string'||!/^([a-f0-9]{8}-)([a-f0-9]{4}-){3}[a-f0-9]{12}$/.test(v.requestId)||!families.includes(v.family)||!outcomes.includes(v.outcome)||!methods.includes(v.method)||!count(v.durationMs)||v.durationMs>86400000)return false;
  if(v.outcome==='aborted')return v.status===null;
  return Number.isInteger(v.status)&&(v.outcome==='server_error'?v.status>=500&&v.status<=599:v.outcome==='client_error'?v.status>=400&&v.status<=499:v.status>=200&&v.status<400);
}
export async function summarizeObservations(input,{maxBytes=8*1024*1024,maxLines=100000}={}){
  let bytes=0;
  async function* bounded(){for await(const chunk of input){const value=Buffer.isBuffer(chunk)?chunk:Buffer.from(chunk);bytes+=value.byteLength;if(bytes>maxBytes)throw Error('Input too large');yield value;}}
  const source=Readable.from(bounded()),lines=createInterface({input:source,crlfDelay:Infinity});
  const result={readOnly:true,observedRequests:0,outcomes:Object.fromEntries(outcomes.map(k=>[k,0])),families:Object.fromEntries(families.map(k=>[k,0])),maxObservedDurationMs:0,suppressed:0,uiRenderFailures:0,maintenanceStates:Object.fromEntries(maintenance.map(k=>[k,0])),ignoredLines:0,invalidRecords:0,incomplete:false};
  let total=0;
  try{for await(const line of lines){
    if(++total>maxLines)throw Error('Too many lines');
    if(line.length>16384){result.ignoredLines++;continue;}
    const start=line.indexOf('{');let value;
    try{value=JSON.parse(start<0?'':line.slice(start));}catch{result.ignoredLines++;continue;}
    if(value?.event==='http_request'){
      if(!validRequest(value)){result.invalidRecords++;continue;}
      result.observedRequests++;result.outcomes[value.outcome]++;result.families[value.family]++;result.maxObservedDurationMs=Math.max(result.maxObservedDurationMs,value.durationMs);
    }else if(value?.event==='http_observation_suppressed'){
      if(!exact(value,['event','count'])||!count(value.count)||value.count>Number.MAX_SAFE_INTEGER-result.suppressed){result.invalidRecords++;continue;}result.suppressed+=value.count;
    }else if(value?.event==='ui_render_failed'){
      if(!exact(value,['event'])){result.invalidRecords++;continue;}result.uiRenderFailures++;
    }else if(value?.event==='maintenance_health'){
      if(!exact(value,['event','state'])||!maintenance.includes(value.state)){result.invalidRecords++;continue;}result.maintenanceStates[value.state]++;
    }else result.ignoredLines++;
  }}finally{lines.close();source.destroy();}
  result.incomplete=result.suppressed>0||result.invalidRecords>0||result.ignoredLines>0;
  return result;
}
