import {createHash} from 'node:crypto';
import {maintenanceConfig} from './maintenance-ops.js';
const refs=new Set(['klfmscuogsocfjxqkuib','cifhcrlmjnsxpkhyloen']);
const bad=()=>{throw new Error('Invalid payment review input');};
export function reviewOptions(args){
 const [task,...rest]=args;if(!['plan','apply'].includes(task))bad();
 const options={task,execute:false,confirmed:false},seen=new Set();
 for(let i=0;i<rest.length;i++){
  const flag=rest[i];if(seen.has(flag))bad();seen.add(flag);
  if(flag==='--execute')options.execute=true;
  else if(flag==='--confirm-provider-review')options.confirmed=true;
  else if(['--project-ref','--manifest','--evidence'].includes(flag)){
   const value=rest[++i];if(!value||value.startsWith('--'))bad();
   options[{'--project-ref':'ref','--manifest':'manifest','--evidence':'evidence'}[flag]]=value;
  }else bad();
 }
 if(!refs.has(options.ref)||!options.manifest||!options.evidence)bad();
 if(task==='plan'&&(options.execute||options.confirmed))bad();
 if(task==='apply'&&(!options.execute||!options.confirmed))bad();
 return Object.freeze(options);
}
export function reviewManifest(value,options,evidence){
 const fields=['version','projectRef','attemptId','amount','merchant','providerReference','transaction','evidenceSha256','source','caseReference','reviewer','reviewedAt','providerOutcome'];
 if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).length!==fields.length||Object.keys(value).some(k=>!fields.includes(k)))bad();
 const string=(v,re)=>typeof v==='string'&&re.test(v);
 if(value.version!==1||value.projectRef!==options.ref||value.providerOutcome!=='paid'
 ||!string(value.attemptId,/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i)
 ||!Number.isSafeInteger(value.amount)||value.amount<=0
 ||typeof value.merchant!=='string'||value.merchant.trim()!==value.merchant||!value.merchant.length||value.merchant.length>128||/[\x00-\x1f\x7f]/.test(value.merchant)
 ||!string(value.providerReference,/^[1-9][0-9]{0,255}$/)||!string(value.transaction,/^[1-9][0-9]{0,255}$/)
 ||!string(value.evidenceSha256,/^[0-9a-f]{64}$/)||!['provider_portal','provider_support'].includes(value.source)
 ||!string(value.caseReference,/^[A-Za-z0-9][A-Za-z0-9._:/-]{2,127}$/)||!string(value.reviewer,/^[A-Za-z0-9][A-Za-z0-9._-]{2,79}$/)
 ||!string(value.reviewedAt,/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/)||!Number.isFinite(Date.parse(value.reviewedAt)))bad();
 if(!(evidence instanceof Uint8Array)||evidence.length<1||evidence.length>2*1024*1024
 ||createHash('sha256').update(evidence).digest('hex')!==value.evidenceSha256)bad();
 return Object.freeze({p_attempt:value.attemptId,p_amount:value.amount,p_merchant:value.merchant,p_ref:value.providerReference,
  p_transaction:value.transaction,p_evidence_sha256:value.evidenceSha256,p_source:value.source,p_case:value.caseReference,
  p_reviewer:value.reviewer,p_reviewed_at:value.reviewedAt,p_apply:options.task==='apply'});
}
export const reviewConfig=(options,env)=>maintenanceConfig(options,env);
export function reviewFetch(origin,transport=globalThis.fetch){
 return (input,init={})=>{
  const url=new URL(typeof input==='string'||input instanceof URL?String(input):input.url);
  const method=(init.method??(typeof input==='object'&&input.method)??'GET').toUpperCase();
  if(url.origin!==origin||url.username||url.password||url.search||url.hash||method!=='POST'
   ||url.pathname!=='/rest/v1/rpc/trusted_review_payment')throw new Error('Payment review transport blocked');
  const signal=init.signal?AbortSignal.any([init.signal,AbortSignal.timeout(15000)]):AbortSignal.timeout(15000);
  return transport(input,{...init,signal,redirect:'error'});
 };
}
export async function runPaymentReview(options,args,client){
 if(!refs.has(options.ref)||!['plan','apply'].includes(options.task)||args.p_apply!==(options.task==='apply')
 ||(options.task==='apply'&&(!options.execute||!options.confirmed)))bad();
 const {data,error}=await client.rpc('trusted_review_payment',args);
 if(error||!data||typeof data!=='object'||Array.isArray(data)||typeof data.applied!=='boolean'
 ||!['eligible','durable_evidence_available','settled','already_settled'].includes(data.outcome)
 ||data.applied!==(data.outcome==='settled')||(options.task==='plan'&&data.applied)
 ||(options.task==='apply'&&data.outcome==='eligible'))throw new Error('Payment review result unavailable; inspect before retry');
 return Object.freeze({project:options.ref,task:options.task,outcome:data.outcome,applied:data.applied});
}
