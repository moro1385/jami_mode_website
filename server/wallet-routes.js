import {Router} from 'express';
import {bitpayProvider} from './bitpay-provider.js';
import {createClient} from '@supabase/supabase-js';
const uuid=value=>typeof value==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
const options={auth:{persistSession:false,autoRefreshToken:false}};
const adminClient=()=>createClient(process.env.SUPABASE_URL??'',process.env.SUPABASE_SERVICE_ROLE_KEY??'',options);
const authenticate=async header=>{
 if(typeof header!=='string'||!header.startsWith('Bearer '))return null;
 const client=createClient(process.env.SUPABASE_URL??'',process.env.SUPABASE_ANON_KEY??'',{...options,global:{headers:{Authorization:header}}});
 const {data,error}=await client.auth.getUser();return error?null:data.user;
};
export function createWalletRouter({admin=adminClient,auth=authenticate,enabled=process.env.JAMI_WALLET_SPENDING_ENABLED==='true',topupsEnabled=process.env.JAMI_WALLET_TOPUPS_ENABLED==='true'&&bitpayProvider.newPaymentsEnabled===true}={}){
 const router=Router();
 router.get('/summary',async(req,res)=>{
  res.set('Cache-Control','no-store');
  try{
   const user=await auth(req.headers.authorization);if(!user)return res.status(401).json({error:'Unauthorized'});
   const query=req.query??{},before=query.before??null,beforeId=query.beforeId??null;
   if(Object.keys(query).some(k=>!['before','beforeId'].includes(k))||(before===null)!==(beforeId===null)
    ||(before!==null&&(typeof before!=='string'||before.length>40||!/^\d{4}-\d{2}-\d{2}T/.test(before)||!Number.isFinite(Date.parse(before))||!uuid(beforeId))))return res.status(400).json({error:'Invalid history cursor'});
   const {data,error}=await admin().rpc('trusted_wallet_view',{p_user:user.id,p_before:before,p_before_id:beforeId,p_limit:20});
   if(error||!data||!Number.isSafeInteger(data.balance)||data.balance<0||data.currency!=='IRR'||!Array.isArray(data.entries)||!Array.isArray(data.pendingTopups))throw Error('Unavailable');
   return res.status(200).json({balance:data.balance,currency:'IRR',entries:data.entries,hasMore:data.hasMore===true,pendingTopups:data.pendingTopups,
    spendingEnabled:enabled&&data.spendingEnabled===true,topupsEnabled:topupsEnabled&&data.topupsEnabled===true,...(topupsEnabled&&data.topupReviewRequired===true?{reviewRequired:true}:{})});
  }catch{return res.status(503).json({error:'Wallet view unavailable'});}
 });
 for(const [path,create] of [['/checkout/quote',false],['/checkout',true]])router.post(path,async(req,res)=>{
  res.set('Cache-Control','no-store');
  // Separate server and database gates; neither enables new gateway top-ups.
  if(!enabled)return res.status(503).json({code:'WALLET_SPENDING_DISABLED'});
  try{
   const user=await auth(req.headers.authorization);if(!user)return res.status(401).json({error:'Unauthorized'});
   const body=req.body;
   if(!body||!uuid(body.idempotencyKey)||!body.selection||typeof body.selection!=='object'||Array.isArray(body.selection)
    ||Object.keys(body).some(key=>!['idempotencyKey','selection','quote'].includes(key))
    ||(create&&(typeof body.quote!=='string'||!body.quote.trim())))return res.status(400).json({error:'Invalid wallet checkout'});
   const {data,error}=await admin().rpc('trusted_wallet_checkout',{p_user:user.id,p_key:body.idempotencyKey,p_request:body.selection,p_quote:create?body.quote:null});
   if(error||!data||(create&&data.success!==true&&!data.code))throw Error('Rejected');
   return res.status(data.code==='PENDING_ORDER_LIMIT'?429:data.code?409:200).json(data);
  }catch{return res.status(409).json({error:'Wallet checkout rejected',code:'WALLET_CHECKOUT_REJECTED'});}
 });
 return router;
}
export default createWalletRouter();
