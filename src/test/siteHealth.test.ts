// @vitest-environment node
import {describe,expect,it,vi} from 'vitest';
import {checkSiteHealth,siteOrigin} from '../../scripts/lib/site-health.mjs';
const json=(value:unknown,status=200)=>new Response(JSON.stringify(value),{status,headers:{'content-type':'application/json'}});
describe('one-shot public health checks',()=>{
 it.each(['http://jamimode.ir','https://evil.invalid','https://jamimode.ir.evil.invalid','https://user:secret@jamimode.ir','https://jamimode.ir?secret=private','https://jamimode.ir/api','https://jamimode.ir:444','http://127.0.0.1:9999'])('rejects an unsupported target without contacting it: %s',async raw=>{const send=vi.fn();await expect(checkSiteHealth(raw,{send})).rejects.toThrow();expect(send).not.toHaveBeenCalled();});
 it('accepts only the site origins and explicit loopback development ports',()=>{expect(siteOrigin()).toBe('https://jamimode.ir');expect(siteOrigin('https://www.jamimode.ir')).toBe('https://www.jamimode.ir');expect(siteOrigin('http://127.0.0.1:8080')).toBe('http://127.0.0.1:8080');});
 it('uses three fixed GET probes without credentials, redirects, retries or returned payloads',async()=>{
  const send=vi.fn(async(url:string,_init:RequestInit)=>json(url.includes('/supabase/')?{version:'synthetic',privateField:'never-print-me'}:{status:'ok',privateField:'never-print-me'}));
  const result=await checkSiteHealth(undefined,{send});expect(result.result).toBe('ok');expect(send).toHaveBeenCalledTimes(3);expect(JSON.stringify(result)).not.toContain('never-print');
  for(const [url,init]of send.mock.calls){expect(url).toMatch(/^https:\/\/jamimode.ir\/api\/(health\/(live|maintenance)|supabase\/auth\/v1\/health)$/);expect(init).toMatchObject({method:'GET',redirect:'error',credentials:'omit',cache:'no-store'});const headers=new Headers(init.headers);expect(headers.get('authorization')).toBeNull();expect(headers.get('cookie')).toBeNull();if(url.includes('/supabase/'))expect(headers.get('apikey')).toMatch(/^sb_publishable_/);}
 });
 it('distinguishes maintenance failure from a reachable site and does not leak upstream error text',async()=>{
  const send=vi.fn(async(url:string)=>url.includes('/maintenance')?json({message:'private-diagnostic'},503):json({status:'ok'}));const result=await checkSiteHealth(undefined,{send});expect(result.result).toBe('degraded');expect(result.checks.find((c:{name:string})=>c.name==='maintenance')).toMatchObject({ok:false,status:503,reason:'http_error'});expect(JSON.stringify(result)).not.toContain('private-diagnostic');
 });
 it.each([new Response('<html>private</html>',{headers:{'content-type':'text/html'}}),json([]),json({status:'not-ok'})])('rejects a false healthy live response %#',async response=>{
  const result=await checkSiteHealth(undefined,{send:vi.fn(async(url:string)=>url.endsWith('/live')?response:json({status:'ok'}))});expect(result.checks[0]).toMatchObject({ok:false,reason:'invalid_response'});
 });
 it('bounds JSON response size and cancels its stream',async()=>{
  const cancel=vi.fn();const stream=new ReadableStream({start(controller){controller.enqueue(new Uint8Array(32769));},cancel});
  const result=await checkSiteHealth(undefined,{send:vi.fn(async(url:string)=>url.endsWith('/live')?new Response(stream,{headers:{'content-type':'application/json'}}):json({status:'ok'}))});expect(result.checks[0].ok).toBe(false);expect(cancel).toHaveBeenCalledOnce();
 });
 it('bounds network deadlines and hides socket diagnostics',async()=>{
  const send=vi.fn((_url:string,init:{signal:AbortSignal})=>new Promise<Response>((_resolve,reject)=>init.signal.addEventListener('abort',()=>reject(Error('secret socket diagnostic')))));
  const result=await checkSiteHealth(undefined,{send,timeoutMs:20});expect(result.result).toBe('unavailable');expect(result.checks.every((c:{reason:string})=>c.reason==='timeout')).toBe(true);expect(JSON.stringify(result)).not.toContain('socket');expect(send).toHaveBeenCalledTimes(3);
 });
});
