// Public read-only checks. No dotenv loading, login, secret key or database write.
import {publicSupabaseConfig} from '../config/supabase-public.js';
const origin=process.argv[2]??'https://jamimode.ir';
let url;
try {url=new URL(origin);} catch {throw Error('Provide the site origin only');}
if(url.username||url.password||url.search||url.hash||url.pathname!=='/'||!((url.protocol==='https:'&&['jamimode.ir','www.jamimode.ir'].includes(url.hostname)&&!url.port)||(url.protocol==='http:'&&url.hostname==='127.0.0.1'&&['3000','8080','4180'].includes(url.port))))throw Error('Site origin is not allowlisted');
const {key}=publicSupabaseConfig({MODE:'production'});
const checks=[];
for(const [stage,path] of [['auth','/auth/v1/health'],['publicData','/rest/v1/products?select=id&limit=1']]){
 try{
  const response=await fetch(url.origin+'/api/supabase'+path,{headers:{apikey:key},redirect:'error',cache:'no-store',signal:AbortSignal.timeout(15000)});
  if(!response.ok||!response.headers.get('content-type')?.includes('application/json')){checks.push({stage,ok:false,httpStatus:response.status});continue;}
  const data=await response.json();checks.push({stage,ok:stage==='publicData'?Array.isArray(data):data!==null&&typeof data==='object',httpStatus:response.status});
 }catch{checks.push({stage,ok:false,unavailable:true});}
}
const ok=checks.every(check=>check.ok);console.log(JSON.stringify({result:ok?'ok':'unavailable',readOnly:true,checks}));if(!ok)process.exitCode=1;
