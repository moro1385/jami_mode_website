// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createMaintenanceHealth, maintenanceHealthRouter, maintenanceHealthState, productionMaintenanceHealth, startMaintenanceWatch } from '../../server/maintenance-health.js';
const now = Date.parse('2026-10-19T18:00:00Z');
const fresh = {lastExpiryRun:{finishedAt:new Date(now-60000).toISOString(),expired:0,settled:0,pending:0}};
afterEach(()=>{vi.unstubAllGlobals();vi.useRealTimers();});
describe('scheduler health states',()=>{
 it('does not let a recent reconciliation hide stale expiry work or accept the old report contract',()=>{
  const recent={finishedAt:new Date(now).toISOString()};
  expect(maintenanceHealthState({lastRun:recent},now)).toBe('unavailable');
  expect(maintenanceHealthState({lastRun:recent,lastExpiryRun:{finishedAt:new Date(now-900001).toISOString()}},now)).toBe('stale');
 });

 it.each([['healthy',fresh],['never_run',{lastExpiryRun:null}],['stale',{lastExpiryRun:{finishedAt:new Date(now-900001).toISOString()}}],['unavailable',{}],['unavailable',{lastExpiryRun:{finishedAt:'invalid'}}],['unavailable',{lastExpiryRun:{finishedAt:'2026-10-19T18:00:00'}}],['unavailable',{lastExpiryRun:{finishedAt:new Date(now+60001).toISOString()}}]])('reports %s from durable completion time',(expected,data)=>expect(maintenanceHealthState(data,now)).toBe(expected));
 it('accepts the exact grace boundary and valid timezone offsets',()=>{
  expect(maintenanceHealthState({lastExpiryRun:{finishedAt:'2026-10-19T21:15:00+03:30'}},now)).toBe('healthy');
 });
 it('coalesces concurrent requests, caches reads and emits only state transitions',async()=>{
  let time=now;let resolve!: (value:unknown)=>void;const read=vi.fn().mockImplementationOnce(()=>new Promise(r=>{resolve=r;})).mockResolvedValue(fresh);const notify=vi.fn();
  const health=createMaintenanceHealth({read,now:()=>time,notify});const one=health.check(),two=health.check();expect(read).toHaveBeenCalledOnce();resolve(fresh);
  expect(await one).toEqual({state:'healthy',healthy:true});await two;await health.check();expect(read).toHaveBeenCalledOnce();expect(notify).toHaveBeenCalledWith('healthy');
  time+=30000;await health.check();expect(read).toHaveBeenCalledTimes(2);expect(notify).toHaveBeenCalledOnce();
 });
 it('does not leak errors, caches failure, warns periodically and announces recovery',async()=>{
  let time=now;const notify=vi.fn();const read=vi.fn().mockRejectedValue(new Error('secret customer payload'));const health=createMaintenanceHealth({read,now:()=>time,notify});
  expect(await health.check()).toEqual({state:'unavailable',healthy:false});await health.check();expect(read).toHaveBeenCalledOnce();time+=60000;await health.check();expect(notify).toHaveBeenCalledOnce();
  time+=15*60000;await health.check();expect(notify).toHaveBeenCalledTimes(2);read.mockResolvedValue({lastExpiryRun:{finishedAt:new Date(time).toISOString()}});time+=30000;await health.check();expect(notify.mock.calls.at(-1)).toEqual(['healthy']);
  expect(JSON.stringify(notify.mock.calls)).not.toContain('secret');
 });
 it('refreshes after a backwards clock jump and tolerates a broken logger',async()=>{
  let time=now;const read=vi.fn().mockResolvedValue(fresh);const health=createMaintenanceHealth({read,now:()=>time,notify:()=>{throw new Error('logger');}});await health.check();time-=1000;expect((await health.check()).healthy).toBe(true);expect(read).toHaveBeenCalledTimes(2);
 });
});
describe('private read transport and public health boundary',()=>{
 it('uses only the read-only report RPC and strips all diagnostics from HTTP',async()=>{
  const fetch=vi.fn().mockResolvedValue(new Response(JSON.stringify({lastRun:{finishedAt:new Date().toISOString(),expired:0,settled:0,pending:0},lastExpiryRun:{finishedAt:new Date().toISOString(),expired:0,settled:0,pending:0},expiredUnstarted:0,verifiedReady:0,verificationUncertain:0,creatingOver15m:0,readyWithoutEvidenceOver30m:3}),{status:200,headers:{'Content-Type':'application/json'}}));vi.stubGlobal('fetch',fetch);
  const health=productionMaintenanceHealth({SUPABASE_URL:'https://cifhcrlmjnsxpkhyloen.supabase.co',SUPABASE_SERVICE_ROLE_KEY:'sb_secret_synthetic'});
  expect((await health.check()).healthy).toBe(true);expect(fetch).toHaveBeenCalledOnce();const [url,init]=fetch.mock.calls[0];expect(String(url)).toBe('https://cifhcrlmjnsxpkhyloen.supabase.co/rest/v1/rpc/trusted_maintenance_status');expect(init.method).toBe('POST');expect(init.redirect).toBe('error');expect(init.signal).toBeInstanceOf(AbortSignal);
 });
 it('fails closed before networking when environment is missing or targets another project',async()=>{
  const fetch=vi.fn();vi.stubGlobal('fetch',fetch);for(const env of [{},{SUPABASE_URL:'https://other.supabase.co',SUPABASE_SERVICE_ROLE_KEY:'sb_secret_synthetic'}]) expect(await productionMaintenanceHealth(env).check()).toEqual({state:'unavailable',healthy:false});expect(fetch).not.toHaveBeenCalled();
 });
 it.each([true,false])('HTTP health reports only minimal status (healthy=%s)',async healthy=>{
  const health={check:vi.fn().mockResolvedValue({healthy,state:'sensitive state',customer:'omit'})};const router=maintenanceHealthRouter(health);const handler=router.stack.find(l=>l.route.path==='/maintenance').route.stack[0].handle;
  const res={set:vi.fn(),status:vi.fn(),json:vi.fn()};Object.values(res).forEach(f=>f.mockReturnValue(res));await handler({},res);expect(res.status).toHaveBeenCalledWith(healthy?200:503);expect(res.json).toHaveBeenCalledWith({status:healthy?'ok':'unavailable'});expect(res.set).toHaveBeenCalledWith('Cache-Control','no-store');
 });
 it('liveness never depends on the scheduler/database or triggers a read',async()=>{
  const health={check:vi.fn().mockRejectedValue(new Error('down'))};const router=maintenanceHealthRouter(health);const handler=router.stack.find(l=>l.route.path==='/live').route.stack[0].handle;const res={set:vi.fn(),status:vi.fn(),json:vi.fn()};Object.values(res).forEach(f=>f.mockReturnValue(res));handler({},res);expect(res.status).toHaveBeenCalledWith(200);expect(health.check).not.toHaveBeenCalled();
 });
 it('starts delayed checks and cancels both timers on stop',async()=>{
  vi.useFakeTimers();const health={check:vi.fn().mockResolvedValue({healthy:true})};const stop=startMaintenanceWatch(health);expect(health.check).not.toHaveBeenCalled();await vi.advanceTimersByTimeAsync(1000);expect(health.check).toHaveBeenCalledOnce();await vi.advanceTimersByTimeAsync(59000);expect(health.check).toHaveBeenCalledTimes(2);stop();await vi.advanceTimersByTimeAsync(120000);expect(health.check).toHaveBeenCalledTimes(2);
 });
});
