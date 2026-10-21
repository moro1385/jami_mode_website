// Explicit operator check only. No credentials, environment files or IP logging.
import {isIP} from 'node:net';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
const SITE='https://jamimode.ir/api/health/client-ip';
const REFERENCE='https://www.cloudflare.com/cdn-cgi/trace';
function normalized(value){
 if(typeof value!=='string'||!isIP(value))return null;
 if(value.toLowerCase().startsWith('::ffff:')&&isIP(value.slice(7))===4)return value.slice(7);
 return isIP(value)===6?new URL('http://['+value+']/').hostname.toLowerCase():value;
}
export async function checkClientIP(fetchImpl=fetch){
 let stage='reference';
 try{
  const options=()=>({redirect:'error',credentials:'omit',cache:'no-store',signal:AbortSignal.timeout(10000)});
  const reference=await fetchImpl(REFERENCE,options());
  if(reference.status!==200)return {result:'unavailable',stage,httpStatus:reference.status};
  const expected=normalized((await reference.text()).match(/^ip=([^\r\n]+)$/m)?.[1]);
  if(!expected)return {result:'unavailable',stage};
  stage='site';
  const base=await fetchImpl(SITE,options());
  if(base.status!==200)return {result:'unavailable',stage,httpStatus:base.status};
  const baseline=normalized((await base.json()).ip);
  if(!baseline)return {result:'unavailable',stage};
  stage='forwarded-headers';
  const forgedIPs=[];
  for(const headers of [
   {'X-Forwarded-For':'192.0.2.123','CF-Connecting-IP':'198.51.100.123','X-Real-IP':'203.0.113.123'},
   {'X-Forwarded-For':'192.0.2.124, 198.51.100.124','CF-Connecting-IP':'203.0.113.124','Forwarded':'for=192.0.2.124'},
  ]){
   const response=await fetchImpl(SITE,{...options(),headers});
   if(response.status!==200)return {result:'unavailable',stage,httpStatus:response.status};
   const ip=normalized((await response.json()).ip);
   if(!ip)return {result:'unavailable',stage};
   forgedIPs.push(ip);
  }
  const referenceMatches=baseline===expected,forwardedHeadersIgnored=forgedIPs.every(ip=>ip===baseline);
  return {result:referenceMatches&&forwardedHeadersIgnored?'passed':'needs_review',referenceMatches,forwardedHeadersIgnored};
 }catch{return {result:'unavailable',stage};}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 const report=await checkClientIP();
 console.log(JSON.stringify(report));
 if(report.result!=='passed')process.exitCode=1;
}
