// @vitest-environment node
import {afterEach,describe,expect,it} from 'vitest';
import {promises as fs} from 'node:fs';
import path from 'node:path';
import {tmpdir} from 'node:os';
import {advanceHistory,safeHealthSample,validateHistory,healthHistoryReport,healthHistoryPath,recordHealthHistory,readHealthHistory} from '../../scripts/lib/health-history.mjs';
const origin='https://jamimode.ir',now=Date.parse('2026-10-27T12:00:00.000Z');
const sample=(failed:string[]=[])=>({result:failed.length===0?'ok':failed.length===3?'unavailable':'degraded',readOnly:true,checks:['live','maintenance','supabase'].map(name=>({name,ok:!failed.includes(name),status:failed.includes(name)?503:200,reason:failed.includes(name)?'http_error':'ok',durationMs:100}))});
const dirs:string[]=[];
async function temporary(){const dir=await fs.mkdtemp(path.join(tmpdir(),'jami-health-test-'));dirs.push(dir);return{dir,file:path.join(dir,'jamimode-health-history.json')};}
afterEach(async()=>{for(const dir of dirs.splice(0)){const resolved=await fs.realpath(dir),root=await fs.realpath(tmpdir());if(path.dirname(resolved)!==root||!path.basename(resolved).startsWith('jami-health-test-'))throw Error('Unsafe temporary cleanup');await fs.rm(resolved,{recursive:true,force:true});}});
describe('bounded health history and local transitions',()=>{
 it('waits for three failed observations, emits only one problem, then requires two good observations for recovery',()=>{
  let history=advanceHistory(null,sample(),origin,now).history;
  history=advanceHistory(history,sample(),origin,now+1000).history;
  for(let n=1;n<=2;n++){const result=advanceHistory(history,sample(['supabase']),origin,now+1000+n*1000);expect(result.events).toEqual([]);history=result.history;}
  let result=advanceHistory(history,sample(['supabase']),origin,now+4000);expect(result.events).toEqual([{at:'2026-10-27T12:00:04.000Z',event:'monitor_problem',probe:'supabase',reason:'http_error'}]);history=result.history;
  result=advanceHistory(history,sample(['supabase']),origin,now+5000);expect(result.events).toEqual([]);history=result.history;
  result=advanceHistory(history,sample(),origin,now+6000);expect(result.events).toEqual([]);history=result.history;
  result=advanceHistory(history,sample(),origin,now+7000);expect(result.events[0]).toMatchObject({event:'monitor_recovered',probe:'supabase',reason:'ok'});expect(result.history.probes.find((p:{name:string})=>p.name==='supabase')?.state).toBe('healthy');
 });
 it('resets failure streaks across intermittent success and never treats the first success as recovery',()=>{
  let history=advanceHistory(null,sample(['live']),origin,now).history;
  history=advanceHistory(history,sample(),origin,now+1000).history;
  history=advanceHistory(history,sample(['live']),origin,now+2000).history;expect(history.events).toEqual([]);expect(history.probes[0].failures).toBe(1);
 });
 it('retains bounded recent samples and transitions across a long sequence',()=>{
  let history=null;for(let n=0;n<500;n++)history=advanceHistory(history,sample(n%5<3?['live','maintenance','supabase']:[]),origin,now+n*1000).history;
  expect(history.entries).toHaveLength(288);expect(history.events.length).toBeLessThanOrEqual(40);expect(history.entries.at(-1)?.at).toBe(new Date(now+499000).toISOString());expect(()=>validateHistory(history)).not.toThrow();
 });
 it('reports freshness and observer scope without inventing uptime or payment settlement',()=>{
  const history=advanceHistory(null,sample(),origin,now).history;
  expect(healthHistoryReport(history,now+300000)).toMatchObject({stale:false,ageSeconds:300,scope:'single-observer-public-health-only'});
  expect(healthHistoryReport(history,now+300001).stale).toBe(true);
  expect(healthHistoryReport(history,now+301000).stale).toBe(true);expect(healthHistoryReport(history,now-1).stale).toBe(true);
  expect(healthHistoryReport(history)).not.toHaveProperty('uptime');expect(healthHistoryReport(history)).not.toHaveProperty('paidOrders');
 });
 it('rejects another target or a backward clock before modifying history',()=>{
  const history=advanceHistory(null,sample(),origin,now).history,before=JSON.stringify(history);
  expect(()=>advanceHistory(history,sample(),'https://www.jamimode.ir',now+1)).toThrow();expect(()=>advanceHistory(history,sample(),origin,now-1)).toThrow();expect(JSON.stringify(history)).toBe(before);
 });
 it.each([
  {...sample(),secret:'never-print'}, {...sample(),result:'unavailable'}, {...sample(),readOnly:false}, {...sample(),checks:[]},
  {...sample(),checks:sample().checks.map(c=>({...c,token:'never-print'}))},
  {...sample(),checks:sample().checks.map(c=>({...c,durationMs:NaN}))},
  {...sample(),checks:sample().checks.map(c=>({...c,status:200,reason:'http_error',ok:false})),result:'unavailable'},
 ])('rejects malformed or widened health records %#',value=>expect(()=>safeHealthSample(value)).toThrow());
 it('does not mutate supplied arrays or preserve unrelated private fields',()=>{
  const input=sample(),history=advanceHistory(null,input,origin,now).history;input.checks[0].durationMs=999;expect(history.entries[0].sample.checks[0].durationMs).toBe(100);expect(JSON.stringify(history)).not.toContain('password');
 });
 it('rejects an unrelated file schema, excessive history and malformed events',()=>{
  const history=advanceHistory(null,sample(),origin,now).history;
  for(const value of [{...history,kind:'unrelated'},{...history,private:'never-print'},{...history,entries:Array(289).fill(history.entries[0])},{...history,events:[{at:new Date(now).toISOString(),event:'monitor_problem',probe:'private-account',reason:'http_error'}]}])expect(()=>validateHistory(value)).toThrow();
 });
});
describe('owned atomic history files',()=>{
 it('creates and updates a dedicated file outside the repository with no leftover lock or temporary file',async()=>{
  const {dir,file}=await temporary();expect(await readHealthHistory(file)).toBeNull();
  await recordHealthHistory(file,sample(),{time:now});await recordHealthHistory(file,sample(['maintenance']),{time:now+1000});
  const saved=await readHealthHistory(file);expect(saved?.entries).toHaveLength(2);expect(await fs.readdir(dir)).toEqual(['jamimode-health-history.json']);
 });
 it('keeps previous data intact when validation fails and releases only its own lock',async()=>{
  const {dir,file}=await temporary();await recordHealthHistory(file,sample(),{time:now});const before=await fs.readFile(file,'utf8');
  await expect(recordHealthHistory(file,{...sample(),password:'never-print'},{time:now+1})).rejects.toThrow();expect(await fs.readFile(file,'utf8')).toBe(before);expect(await fs.readdir(dir)).toEqual(['jamimode-health-history.json']);
 });
 it('refuses a pre-existing lock without stealing it or changing history',async()=>{
  const {file}=await temporary();await fs.mkdir(file+'.lock');await expect(recordHealthHistory(file,sample(),{time:now})).rejects.toThrow();expect((await fs.stat(file+'.lock')).isDirectory()).toBe(true);expect(await readHealthHistory(file)).toBeNull();
 });
 it('never overwrites an unrelated existing file',async()=>{
  const {file}=await temporary();await fs.writeFile(file,'unrelated-private-text');await expect(recordHealthHistory(file,sample(),{time:now})).rejects.toThrow();expect(await fs.readFile(file,'utf8')).toBe('unrelated-private-text');
 });
 it('rejects oversized files and hard links',async()=>{
  const {dir,file}=await temporary();await fs.writeFile(file,Buffer.alloc(1048577));await expect(readHealthHistory(file)).rejects.toThrow();
  const other=await temporary();await fs.writeFile(other.file,JSON.stringify(advanceHistory(null,sample(),origin,now).history));await fs.link(other.file,path.join(dir,'linked-copy.json'));await expect(readHealthHistory(other.file)).rejects.toThrow();
 });
 it('refuses arbitrary filenames, relative paths and paths inside the source repository',async()=>{
  const {dir}=await temporary();await expect(healthHistoryPath(path.join(dir,'other.json'))).rejects.toThrow();await expect(healthHistoryPath('jamimode-health-history.json')).rejects.toThrow();await expect(healthHistoryPath(path.join(process.cwd(),'jamimode-health-history.json'))).rejects.toThrow();
 });
});
