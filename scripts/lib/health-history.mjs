import {promises as fs} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {randomUUID} from 'node:crypto';
import {siteOrigin} from './site-health.mjs';
const kind='jamimode-health-history-v1',names=['live','maintenance','supabase'];
const reasons=['ok','http_error','invalid_response','timeout','network_error'];
const exact=(v,keys)=>v&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).length===keys.length&&keys.every(k=>Object.hasOwn(v,k));
const integer=(v,max)=>Number.isSafeInteger(v)&&v>=0&&v<=max;
const stamp=v=>typeof v==='string'&&/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(v)&&Number.isFinite(Date.parse(v));
export function safeHealthSample(sample){
  if(!exact(sample,['result','readOnly','checks'])||sample.readOnly!==true||!Array.isArray(sample.checks)||sample.checks.length!==3)throw Error('Invalid sample');
  const checks=names.map(name=>{
    const c=sample.checks.find(v=>v?.name===name);
    if(!exact(c,['name','ok','status','reason','durationMs'])||typeof c.ok!=='boolean'||!reasons.includes(c.reason)||c.ok!==(c.reason==='ok')||!(c.status===null||Number.isInteger(c.status)&&c.status>=100&&c.status<=599)||!integer(c.durationMs,86400000)||c.ok&&!(c.status>=200&&c.status<300))throw Error('Invalid check');
    if(c.reason==='http_error'&&!(c.status>=300)||c.reason==='invalid_response'&&!(c.status>=200&&c.status<300)||c.reason==='network_error'&&c.status!==null)throw Error('Inconsistent check');
    return {...c};
  });
  const result=checks.every(c=>c.ok)?'ok':checks.some(c=>c.ok)?'degraded':'unavailable';
  if(result!==sample.result)throw Error('Invalid result');
  return {result,readOnly:true,checks};
}
export function validateHistory(value){
  if(!exact(value,['kind','origin','entries','probes','events'])||value.kind!==kind||siteOrigin(value.origin)!==value.origin||!Array.isArray(value.entries)||value.entries.length>288||!Array.isArray(value.events)||value.events.length>40||!Array.isArray(value.probes)||value.probes.length!==3)throw Error('Invalid history');
  let last=-Infinity;
  for(const entry of value.entries){if(!exact(entry,['at','sample'])||!stamp(entry.at)||Date.parse(entry.at)<last)throw Error('Invalid entry');safeHealthSample(entry.sample);last=Date.parse(entry.at);}
  for(const name of names){const p=value.probes.find(v=>v?.name===name);if(!exact(p,['name','state','failures','successes'])||!['unknown','healthy','failing'].includes(p.state)||!integer(p.failures,3)||!integer(p.successes,2))throw Error('Invalid probe');}
  for(const event of value.events)if(!exact(event,['at','event','probe','reason'])||!stamp(event.at)||!['monitor_problem','monitor_recovered'].includes(event.event)||!names.includes(event.probe)||!reasons.includes(event.reason)||Date.parse(event.at)>last)throw Error('Invalid event');
  return value;
}
export function advanceHistory(previous,sample,origin='https://jamimode.ir',time=Date.now()){
  const target=siteOrigin(origin),safe=safeHealthSample(sample),at=new Date(time).toISOString();
  const old=previous?validateHistory(previous):{kind,origin:target,entries:[],probes:names.map(name=>({name,state:'unknown',failures:0,successes:0})),events:[]};
  if(old.origin!==target||old.entries.length&&time<Date.parse(old.entries.at(-1).at))throw Error('History target or clock changed');
  const events=[];
  const probes=old.probes.map(previousProbe=>{
    const p={...previousProbe},check=safe.checks.find(c=>c.name===p.name);
    p.failures=check.ok?0:Math.min(3,p.failures+1);p.successes=check.ok?Math.min(2,p.successes+1):0;
    if(!check.ok&&p.failures===3&&p.state!=='failing'){p.state='failing';events.push({at,event:'monitor_problem',probe:p.name,reason:check.reason});}
    if(check.ok&&p.successes===2&&p.state!=='healthy'){if(p.state==='failing')events.push({at,event:'monitor_recovered',probe:p.name,reason:'ok'});p.state='healthy';}
    return p;
  });
  const history={kind,origin:target,entries:[...old.entries,{at,sample:safe}].slice(-288),probes,events:[...old.events,...events].slice(-40)};
  return {history,events};
}
export function healthHistoryReport(history,time=Date.now()){
  const value=validateHistory(history),last=value.entries.at(-1),age=last?Math.max(0,Math.floor((time-Date.parse(last.at))/1000)):null;
  return {origin:value.origin,sampleCount:value.entries.length,lastSampleAt:last?.at??null,ageSeconds:age,stale:age===null||time-Date.parse(last.at)>300000||time<Date.parse(last.at),latest:last?.sample??null,probes:value.probes.map(p=>({...p})),recentEvents:value.events.slice(-10).map(e=>({...e})),scope:'single-observer-public-health-only'};
}
export async function healthHistoryPath(raw){
  if(typeof raw!=='string'||!path.isAbsolute(raw)||path.basename(raw)!=='jamimode-health-history.json')throw Error('Choose the dedicated absolute history filename');
  const parent=await fs.realpath(path.dirname(raw)),repo=await fs.realpath(fileURLToPath(new URL('../../',import.meta.url)));
  const relative=path.relative(repo,parent);if(relative===''||!relative.startsWith('..'+path.sep)&&relative!=='..'&&!path.isAbsolute(relative))throw Error('Keep history outside the source repository');
  return path.join(parent,'jamimode-health-history.json');
}
async function readAt(file){
  let stat;try{stat=await fs.lstat(file);}catch(error){if(error.code==='ENOENT')return null;throw error;}
  if(!stat.isFile()||stat.isSymbolicLink()||stat.nlink>1||stat.size>1048576)throw Error('Unsafe history file');
  return validateHistory(JSON.parse(await fs.readFile(file,'utf8')));
}
export async function readHealthHistory(raw){return readAt(await healthHistoryPath(raw));}
export async function recordHealthHistory(raw,sample,{origin='https://jamimode.ir',time=Date.now()}={}){
  const file=await healthHistoryPath(raw),lock=file+'.lock',temp=file+'.'+randomUUID()+'.tmp';
  // A lock is never stolen automatically. Only this invocation's empty lock is removed.
  await fs.mkdir(lock,{mode:0o700});
  let temporary=false;
  try{
    const result=advanceHistory(await readAt(file),sample,origin,time);
    const bytes=JSON.stringify(result.history);if(Buffer.byteLength(bytes)>1048576)throw Error('History too large');
    await fs.writeFile(temp,bytes,{flag:'wx',mode:0o600});temporary=true;
    await fs.rename(temp,file);temporary=false;
    return {report:healthHistoryReport(result.history,time),events:result.events};
  }finally{
    try{if(temporary)await fs.unlink(temp);}finally{await fs.rmdir(lock);}
  }
}
