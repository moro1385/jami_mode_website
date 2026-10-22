// @vitest-environment node
import {beforeEach,expect,it,vi} from 'vitest';
import {createHash} from 'node:crypto';
import {reviewOptions,reviewManifest,reviewConfig,reviewFetch,runPaymentReview} from '../../server/payment-review.js';
const ref='cifhcrlmjnsxpkhyloen',origin=`https://${ref}.supabase.co`;
const evidence=Buffer.from('Synthetic provider support export, not real payment evidence');
const manifest={version:1,projectRef:ref,attemptId:'31000000-0000-4000-8000-000000000001',amount:20000,
 merchant:'test:review',providerReference:'123',transaction:'456',evidenceSha256:createHash('sha256').update(evidence).digest('hex'),
 source:'provider_support',caseReference:'ticket-123',reviewer:'operator-1',reviewedAt:'2026-10-22T00:00:00.000Z',providerOutcome:'paid'};
const options=()=>reviewOptions(['plan','--project-ref',ref,'--manifest','outside.json','--evidence','outside.pdf']);
const apply=()=>reviewOptions(['apply','--project-ref',ref,'--manifest','outside.json','--evidence','outside.pdf','--execute','--confirm-provider-review']);
beforeEach(()=>vi.restoreAllMocks());
it('plan remains non-mutating and apply requires both explicit acknowledgements',()=>{
 expect(reviewManifest(manifest,options(),evidence).p_apply).toBe(false);
 expect(reviewManifest(manifest,apply(),evidence).p_apply).toBe(true);
 for(const flags of [[],['--execute'],['--confirm-provider-review']])
  expect(()=>reviewOptions(['apply','--project-ref',ref,'--manifest','a','--evidence','b',...flags])).toThrow();
});
it.each([
 ['--project-ref',ref,'--project-ref',ref],['--execute'],['--confirm-provider-review'],['--unknown','value'],['--batch','2'],['--project-ref','different'],['--manifest'],
])('rejects unsupported, duplicate or mutating plan flags %j',flags=>{
 expect(()=>reviewOptions(['plan','--project-ref',ref,'--manifest','a','--evidence','b',...flags])).toThrow();
});
it.each([
 {version:2},{projectRef:'klfmscuogsocfjxqkuib'},{providerOutcome:'already_verified'},{providerOutcome:'pending'},
 {status:11},{source:'customer_screenshot'},{source:'callback'},{attemptId:'bad'},{amount:0},{amount:1.5},{amount:Number.MAX_SAFE_INTEGER+1},
 {merchant:' test:review'},{merchant:'test\nreview'},{providerReference:'0'},{transaction:'1e3'},
 {evidenceSha256:'a'.repeat(64)},{caseReference:'bad\ncase'},{reviewer:'bad name'},{reviewedAt:'not-a-date'},
])('rejects incomplete/mismatched/untrusted review input %j',patch=>{
 expect(()=>reviewManifest({...manifest,...patch},options(),evidence)).toThrow();
});
it('rejects missing, extra, empty and oversized evidence instead of trusting a supplied hash',()=>{
 const partial={...manifest};delete partial.caseReference;
 expect(()=>reviewManifest(partial,options(),evidence)).toThrow();
 expect(()=>reviewManifest(manifest,options(),Buffer.alloc(0))).toThrow();
 expect(()=>reviewManifest(manifest,options(),Buffer.alloc(2*1024*1024+1))).toThrow();
 expect(()=>reviewManifest({...manifest,evidenceSha256:createHash('sha256').update('other').digest('hex')},options(),evidence)).toThrow();
});
it('requires the exact project and a server credential without exposing it',()=>{
 const key='sb_secret_synthetic_only';
 expect(reviewConfig(options(),{SUPABASE_URL:origin,SUPABASE_SERVICE_ROLE_KEY:key}).url).toBe(origin);
 expect(()=>reviewConfig(options(),{SUPABASE_URL:'https://klfmscuogsocfjxqkuib.supabase.co',SUPABASE_SERVICE_ROLE_KEY:key})).toThrow();
 expect(()=>reviewConfig(options(),{SUPABASE_URL:origin,SUPABASE_SERVICE_ROLE_KEY:'sb_publishable_not_private'})).toThrow();
});
it('allows only the fixed review RPC and never redirects, retries or calls the gateway',async()=>{
 const transport=vi.fn().mockResolvedValue({ok:true}),send=reviewFetch(origin,transport);
 await send(origin+'/rest/v1/rpc/trusted_review_payment',{method:'POST'});
 expect(transport).toHaveBeenCalledOnce();expect(transport.mock.calls[0][1]).toMatchObject({redirect:'error'});
 expect(transport.mock.calls[0][1].signal).toBeInstanceOf(AbortSignal);
 for(const url of ['https://bitpay.ir/payment/gateway-result-second',origin+'/rest/v1/rpc/trusted_payment_settle',origin+'/rest/v1/rpc/trusted_review_payment?x=1'])
  expect(()=>send(url,{method:'POST'})).toThrow();
 expect(()=>send(origin+'/rest/v1/rpc/trusted_review_payment')).toThrow();
 expect(transport).toHaveBeenCalledOnce();
});
it('forbids mismatched mutation intent before invoking any RPC',async()=>{
 const rpc=vi.fn();await expect(runPaymentReview(options(),{p_apply:true},{rpc})).rejects.toThrow();
 await expect(runPaymentReview({...apply(),confirmed:false},{p_apply:true},{rpc})).rejects.toThrow();expect(rpc).not.toHaveBeenCalled();
});
it.each(['eligible','durable_evidence_available','already_settled'])('reports only sanitized plan outcome %s',async outcome=>{
 const rpc=vi.fn().mockResolvedValue({data:{outcome,applied:false,customer:'private-data',merchant:'private-data'},error:null});
 expect(await runPaymentReview(options(),reviewManifest(manifest,options(),evidence),{rpc})).toEqual({project:ref,task:'plan',outcome,applied:false});
 expect(rpc.mock.calls[0][0]).toBe('trusted_review_payment');
});
it('apply returns a settled decision and repeated requests can return already-settled',async()=>{
 const rpc=vi.fn().mockResolvedValueOnce({data:{outcome:'settled',applied:true}}).mockResolvedValueOnce({data:{outcome:'already_settled',applied:false}});
 const args=reviewManifest(manifest,apply(),evidence);
 expect((await runPaymentReview(apply(),args,{rpc})).applied).toBe(true);
 expect((await runPaymentReview(apply(),args,{rpc})).outcome).toBe('already_settled');
});
it.each([{error:{message:'private server details'}},{data:null},{data:{outcome:'settled',applied:true}},{data:{outcome:'invented',applied:false}}])('never retries or leaks provider/database errors %j',async result=>{
 const rpc=vi.fn().mockResolvedValue(result);await expect(runPaymentReview(options(),{p_apply:false},{rpc})).rejects.toThrow('inspect before retry');expect(rpc).toHaveBeenCalledOnce();
});
