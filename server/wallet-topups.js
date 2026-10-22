import {integerRial} from './bitpay-provider.js';
const uuid=value=>typeof value==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
const nonempty=value=>typeof value==='string'&&value.trim().length>0;
export function mountWalletTopups(router,{admin,auth,provider,merchant,topupsEnabled}){
 const rpc=async(name,args)=>{
  const {data,error}=await admin().rpc(name,args);
  // Only a definite SQL business rejection is safe to reset. A transport error
  // may hide a committed claim; retain its idempotency key in that case.
  if(error&&name==='trusted_wallet_topup_claim'&&error.code==='P0001'
   &&['Pending topup limit','Wallet balance capacity','New topups disabled','Invalid wallet balance','Wallet review required'].includes(error.message))throw Object.assign(Error('Topup rejected'),{safeRejection:true});
  if(error||!data)throw Error('Topup unavailable');return data;
 };
 router.post('/wallet-init',async(req,res)=>{
  if(!topupsEnabled||provider?.newPaymentsEnabled!==true||!nonempty(merchant()))return res.status(503).json({code:'WALLET_TOPUPS_DISABLED',error:'Wallet top-ups are temporarily unavailable'});
  res.set('Cache-Control','no-store');let topupId;
  try{
   const user=await auth(req.headers.authorization);if(!user)return res.status(401).json({error:'Unauthorized'});
   const body=req.body;
   if(!body||!uuid(body.idempotencyKey)||!Number.isSafeInteger(body.amount)||body.amount<5000||body.amount>99999999
    ||Object.keys(body).some(key=>!['idempotencyKey','amount'].includes(key)))return res.status(400).json({error:'Invalid topup request'});
   const attempt=await rpc('trusted_wallet_topup_claim',{p_user:user.id,p_key:body.idempotencyKey,p_amount:body.amount,p_merchant:merchant()});topupId=attempt.topup_id;
   if(!uuid(attempt.id)||!uuid(topupId)||attempt.order_id!=null||attempt.version!==2||integerRial(attempt.amount)!==body.amount||attempt.currency!=='IRR'||attempt.merchant!==merchant())throw Error('Topup binding mismatch');
   if(attempt.state==='settled'){
    const receipt=await rpc('trusted_wallet_topup_status',{p_user:user.id,p_topup:topupId});
    if(receipt.topupId!==topupId||receipt.paid!==true)throw Error('Topup receipt unavailable');
    return res.status(200).json({topupId,paid:true});
   }
   if(attempt.claimed===true&&attempt.state!=='creating')throw Error('Invalid fresh claim');
   if(attempt.state==='creating'&&attempt.claimed!==true)throw Error('Unresolved topup creation');
   let ready=attempt;
   if(attempt.claimed===true){
    const created=await provider.create(attempt);
    if(created.merchant!==attempt.merchant||integerRial(created.amount)!==body.amount||created.currency!=='IRR')throw Error('Provider create mismatch');
    ready=await rpc('trusted_wallet_topup_attach',{p_attempt:attempt.id,p_user:user.id,p_ref:created.reference,p_merchant:merchant()});
    if(ready.provider_ref!==created.reference)throw Error('Attachment reference mismatch');
   }
   if(ready.id!==attempt.id||ready.version!==2||ready.currency!=='IRR'||ready.order_id!=null||ready.state!=='ready'||ready.topup_id!==topupId||ready.merchant!==attempt.merchant||integerRial(ready.amount)!==body.amount)throw Error('Attached topup mismatch');
   return res.status(200).json({topupId,redirectUrl:provider.redirect(ready.provider_ref)});
  }catch(error){if(error?.safeRejection===true)return res.status(409).json({code:'TOPUP_REJECTED',error:'Topup request rejected before creation'});return res.status(409).json({code:'TOPUP_PENDING_REVIEW',error:'Top-up unresolved; check its status before retrying',...(topupId?{topupId}:{})});}
 });
 router.get('/wallet-topups/:id/status',async(req,res)=>{
  res.set('Cache-Control','no-store');
  try{const user=await auth(req.headers.authorization);if(!user)return res.status(401).json({error:'Unauthorized'});
   if(!uuid(req.params.id))return res.status(404).json({error:'Topup not found'});
   const result=await rpc('trusted_wallet_topup_status',{p_user:user.id,p_topup:req.params.id});return res.status(200).json(result);
  }catch{return res.status(404).json({error:'Topup unavailable'});}
 });
}
