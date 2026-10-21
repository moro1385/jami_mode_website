// @vitest-environment node
import {afterEach,describe,expect,it,vi} from 'vitest';
import express from 'express';
import {maintenanceHealthRouter} from '../../server/maintenance-health.js';
import {createRateLimiter,trustedProxyHops} from '../../server/http-security.js';
import {checkClientIP} from '../../scripts/check-client-ip.mjs';
const servers=[];
afterEach(async()=>{for(const s of servers.splice(0)){s.closeAllConnections();await new Promise<void>(resolve=>s.close(()=>resolve()));}});
async function app(hops:string|undefined,limit=120){
 const health={check:vi.fn()};const app=express();app.set('trust proxy',trustedProxyHops(hops));
 app.use('/api/health',createRateLimiter({limit}),maintenanceHealthRouter(health));
 const server=await new Promise<ReturnType<typeof app.listen>>(resolve=>{const s=app.listen(0,'127.0.0.1',()=>resolve(s));});servers.push(server);
 const address=server.address();if(typeof address==='string'||!address)throw Error('Missing loopback port');
 return {url:'http://127.0.0.1:'+address.port+'/api/health/client-ip',health};
}
describe('read-only client IP observation',()=>{
 it('returns only the request IP with no caching, credentials or database read',async()=>{
  const {url,health}=await app(undefined);
  const response=await fetch(url,{headers:{'X-Forwarded-For':'192.0.2.1','CF-Connecting-IP':'198.51.100.1',Authorization:'Bearer synthetic-secret'}});
  expect(response.status).toBe(200);expect(response.headers.get('cache-control')).toBe('no-store');
  expect(await response.json()).toEqual({ip:'127.0.0.1'});expect(health.check).not.toHaveBeenCalled();
 });
 it('uses the same trusted proxy setting and limiter as the health routes',async()=>{
  const {url}=await app('1',2);
  for(let i=0;i<3;i++){
   const r=await fetch(url,{headers:{'X-Forwarded-For':'192.0.2.'+i+', 198.51.100.10'}});
   expect(r.status).toBe(i<2?200:429);
   if(i<2)expect(await r.json()).toEqual({ip:'198.51.100.10'});
  }
  expect((await fetch(url,{headers:{'X-Forwarded-For':'198.51.100.11'}})).status).toBe(200);
 });
 it('does not reflect malformed forwarded data',async()=>{
  const {url,health}=await app('1');const response=await fetch(url,{headers:{'X-Forwarded-For':'synthetic-private-payload'}});
  expect(response.status).toBe(503);expect(await response.json()).toEqual({status:'unavailable'});expect(health.check).not.toHaveBeenCalled();
 });
});
function transport(ips=['203.0.113.10','203.0.113.10','203.0.113.10'],reference='203.0.113.10'){
 const remaining=[...ips];return vi.fn(async(url:string)=>url.includes('cloudflare.com')
  ?new Response('ip='+reference+'\n',{status:200}):new Response(JSON.stringify({ip:remaining.shift()}),{status:200}));
}
describe('operator live check without IP/credential output',()=>{
 it('compares independent egress and both spoofing attempts using fixed HTTPS origins',async()=>{
  const fetch=transport();expect(await checkClientIP(fetch)).toEqual({result:'passed',referenceMatches:true,forwardedHeadersIgnored:true});
  expect(fetch).toHaveBeenCalledTimes(4);
  for(const [url,options] of fetch.mock.calls as unknown as [string,RequestInit][]){
   expect(['https://www.cloudflare.com/cdn-cgi/trace','https://jamimode.ir/api/health/client-ip']).toContain(url);
   expect(options.redirect).toBe('error');expect(options.credentials).toBe('omit');
   expect(new Headers(options.headers).has('Authorization')).toBe(false);
  }
 });
 it('flags spoofing or differing network egress for review instead of claiming verification',async()=>{
  const mismatch=await checkClientIP(transport(['203.0.113.10','192.0.2.123','203.0.113.10']));
  expect(mismatch).toEqual({result:'needs_review',referenceMatches:true,forwardedHeadersIgnored:false});
  expect(await checkClientIP(transport(undefined,'198.51.100.20'))).toEqual({result:'needs_review',referenceMatches:false,forwardedHeadersIgnored:true});
  expect(JSON.stringify(mismatch)).not.toContain('203.0.113.10');
 });
 it('handles IPv4-mapped addresses and compressed IPv6 consistently',async()=>{
  expect((await checkClientIP(transport(['::ffff:203.0.113.10','::ffff:203.0.113.10','::ffff:203.0.113.10']))).result).toBe('passed');
  expect((await checkClientIP(transport(['2001:db8::1','2001:db8::1','2001:db8::1'],'2001:0db8:0000:0000:0000:0000:0000:0001'))).result).toBe('passed');
 });
 it('does not leak network failures or treat an old release as a successful probe',async()=>{
  expect(await checkClientIP(vi.fn().mockRejectedValue(new Error('secret diagnostic 203.0.113.10')))).toEqual({result:'unavailable',stage:'reference'});
  const fetch=transport();fetch.mockResolvedValueOnce(new Response('ip=203.0.113.10\n')).mockResolvedValueOnce(new Response('{}',{status:404}));
  expect(await checkClientIP(fetch)).toEqual({result:'unavailable',stage:'site',httpStatus:404});
 });
});
