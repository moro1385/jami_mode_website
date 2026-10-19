// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { maintenanceOptions, maintenanceConfig, maintenanceFetch, runMaintenance } from '../../server/maintenance-ops.js';
const ref='cifhcrlmjnsxpkhyloen', origin=`https://${ref}.supabase.co`;
const options=(task='report',extra: string[]=[])=>maintenanceOptions([task,'--project-ref',ref,...extra]);
const status={expiredUnstarted:2,verifiedReady:1,verificationUncertain:3,creatingOver15m:0,readyWithoutEvidenceOver30m:5,lastRun:null};
describe('maintenance command boundaries',()=>{
 it('requires an explicit project and execute for mutation; report has no execution mode',()=>{
  expect(options()).toMatchObject({task:'report',execute:false,ref});
  for(const args of [[],['expire','--project-ref',ref],['report','--project-ref',ref,'--execute'],['report','--project-ref','unknown'],['report','--project-ref',ref,'--project-ref',ref],['report','--project-ref',ref,'--batch','50']]) expect(()=>maintenanceOptions(args)).toThrow();
 });
 it.each(['0','101','-1','1.5','9999999999999','50x'])('rejects invalid batch %s',batch=>expect(()=>options('expire',['--execute','--batch',batch])).toThrow());
 it('pins the exact server origin and accepts only server keys',()=>{
  expect(maintenanceConfig(options(),{SUPABASE_URL:origin,SUPABASE_SERVICE_ROLE_KEY:'sb_secret_synthetic'}).url).toBe(origin);
  const jwt=(role: string,project=ref)=>'fixture.'+Buffer.from(JSON.stringify({role,ref:project})).toString('base64url')+'.fixture';
  expect(maintenanceConfig(options(),{SUPABASE_URL:origin,SUPABASE_SERVICE_ROLE_KEY:jwt('service_role')}).url).toBe(origin);
  for(const env of [{SUPABASE_URL:origin+'/',SUPABASE_SERVICE_ROLE_KEY:'sb_secret_synthetic'},{SUPABASE_URL:origin,SUPABASE_SERVICE_ROLE_KEY:'sb_publishable_synthetic'},{SUPABASE_URL:origin,SUPABASE_SERVICE_ROLE_KEY:jwt('anon')},{SUPABASE_URL:origin,SUPABASE_SERVICE_ROLE_KEY:jwt('service_role','other')}]) expect(()=>maintenanceConfig(options(),env)).toThrow();
 });
 it('blocks providers, other projects and arbitrary methods/RPCs before transport',async()=>{
  const transport=vi.fn().mockResolvedValue(new Response('{}'));const safe=maintenanceFetch(origin,transport);
  for(const url of ['https://bitpay.ir/payment/gateway-send','https://klfmscuogsocfjxqkuib.supabase.co/rest/v1/rpc/trusted_maintenance_run',origin+'/rest/v1/rpc/trusted_payment_settle',origin+'/rest/v1/rpc/trusted_maintenance_run?x=1']) await expect(safe(url,{method:'POST'})).rejects.toThrow();
  await expect(safe(origin+'/rest/v1/rpc/trusted_maintenance_run',{method:'GET'})).rejects.toThrow();expect(transport).not.toHaveBeenCalled();
  await safe(origin+'/rest/v1/rpc/trusted_maintenance_status',{method:'POST',redirect:'follow'});expect(transport.mock.calls[0][1].redirect).toBe('error');
 });
 it('preserves abort and never retries a failed transport',async()=>{
  const controller=new AbortController();controller.abort();const transport=vi.fn().mockRejectedValue(new Error('timeout'));
  await expect(maintenanceFetch(origin,transport)(origin+'/rest/v1/rpc/trusted_maintenance_run',{method:'POST',signal:controller.signal})).rejects.toThrow();
  expect(transport).toHaveBeenCalledOnce();expect(transport.mock.calls[0][1].signal.aborted).toBe(true);
 });
});
describe('maintenance actions and sanitized output',()=>{
 it('check only reads status and preserves the separate expiry timestamp',async()=>{
  const last={finishedAt:'2026-10-19T18:00:00Z',expired:0,settled:0,pending:0};
  const rpc=vi.fn().mockResolvedValue({data:{...status,lastRun:last,lastExpiryRun:{...last,private:'omit'}}});
  expect(await runMaintenance(options('check'),{rpc})).toEqual({...status,lastRun:last,lastExpiryRun:last});
  expect(rpc).toHaveBeenCalledWith('trusted_maintenance_status',{});
  expect(()=>options('check',['--execute'])).toThrow();expect(()=>options('check',['--batch','25'])).toThrow();
 });
 it('rejects financial results in an expiry timestamp',async()=>{
  const data={...status,lastExpiryRun:{finishedAt:'2026-10-19T18:00:00Z',expired:0,settled:1,pending:0}};
  await expect(runMaintenance(options('check'),{rpc:vi.fn().mockResolvedValue({data})})).rejects.toThrow();
 });

 it('report uses only the read-only status RPC and strips unexpected output',async()=>{
  const rpc=vi.fn().mockResolvedValue({data:{...status,secret:'never-print',customer:'never-print'}});
  expect(await runMaintenance(options(),{rpc})).toEqual(status);expect(rpc).toHaveBeenCalledWith('trusted_maintenance_status',{});
 });
 it.each(['expire','reconcile'])('%s opts in only its own batch',async task=>{
  const rpc=vi.fn().mockResolvedValue({data:{skipped:false,expired:0,settled:0,pending:0,runId:3,internal:'omit'}});
  expect(await runMaintenance(options(task,['--execute','--batch','25']),{rpc})).toEqual({skipped:false,expired:0,settled:0,pending:0});
  expect(rpc).toHaveBeenCalledWith('trusted_maintenance_run',{p_expire_limit:task==='expire'?25:0,p_reconcile_limit:task==='reconcile'?25:0});
 });
 it('accepts lock contention without pretending a run occurred',async()=>expect(await runMaintenance(options('expire',['--execute']),{rpc:vi.fn().mockResolvedValue({data:{skipped:true}})})).toEqual({skipped:true}));
 it.each([{...status,verifiedReady:-1},{...status,expiredUnstarted:'2'},{...status,lastRun:{finishedAt:'invalid',expired:0,settled:0,pending:0}}])('rejects malformed reports',async data=>await expect(runMaintenance(options(),{rpc:vi.fn().mockResolvedValue({data})})).rejects.toThrow());
 it('does not accept financial replay results from an expire-only run',async()=>await expect(runMaintenance(options('expire',['--execute']),{rpc:vi.fn().mockResolvedValue({data:{skipped:false,expired:0,settled:1,pending:0}})})).rejects.toThrow());
 it('rejects RPC failure without retry',async()=>{
  const rpc=vi.fn().mockResolvedValue({error:{message:'internal error with private context'}});
  await expect(runMaintenance(options('reconcile',['--execute']),{rpc})).rejects.toThrow('Maintenance result unavailable');expect(rpc).toHaveBeenCalledOnce();
 });
});
