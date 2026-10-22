import {Router} from 'express';
import {createClient} from '@supabase/supabase-js';
const uuid=value=>typeof value==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
const options={auth:{persistSession:false,autoRefreshToken:false}};
const adminClient=()=>createClient(process.env.SUPABASE_URL??'',process.env.SUPABASE_SERVICE_ROLE_KEY??'',options);
const authenticate=async header=>{
 if(typeof header!=='string'||!header.startsWith('Bearer '))return null;
 const client=createClient(process.env.SUPABASE_URL??'',process.env.SUPABASE_ANON_KEY??'',{...options,global:{headers:{Authorization:header}}});
 const {data,error}=await client.auth.getUser();return error?null:data.user;
};
export function createWalletRouter({admin=adminClient,auth=authenticate,enabled=process.env.JAMI_WALLET_SPENDING_ENABLED==='true'}={}){
 const router=Router();
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
