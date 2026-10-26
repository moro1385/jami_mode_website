// @vitest-environment node
import {afterEach,describe,expect,it,vi} from 'vitest';
import express from 'express';
import {createClient} from '@supabase/supabase-js';
import {createSupabaseRelayFetch} from '../lib/supabaseRelay';
import {createServer,type Server} from 'node:http';
import {createSupabaseRelay,relayOrigin,relayPath} from '../../server/supabase-relay.js';
const origin='https://klfmscuogsocfjxqkuib.supabase.co',key='sb_publishable_synthetic';
const jwt=(role:string)=>'eyJhbGciOiJIUzI1NiJ9.'+Buffer.from(JSON.stringify({role,sub:'synthetic'})).toString('base64url')+'.synthetic';
const servers:Server[]=[];
afterEach(async()=>{for(const server of servers.splice(0)){server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));}vi.unstubAllEnvs();});
async function start(options:Record<string,unknown>={}){
 const send=vi.fn().mockImplementation(async()=>new Response('{"ok":true}',{headers:{'content-type':'application/json'}}));
 const app=express();app.use('/api/supabase',createSupabaseRelay({upstream:origin,send,...options}));app.use(express.json());
 const server=createServer(app);servers.push(server);await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));
 const address=server.address();if(!address||typeof address==='string')throw Error();
 const base='http://127.0.0.1:'+address.port;
 const request=(path:string,init:RequestInit={})=>fetch(base+'/api/supabase'+path,{...init,headers:{apikey:key,...init.headers}});
 return{send,base,request};
}
describe('fixed-destination Supabase relay',()=>{
 it('allows only the exact hosted production and test project origins',()=>{
  expect(relayOrigin(origin)).toBe(origin);expect(relayOrigin('https://cifhcrlmjnsxpkhyloen.supabase.co')).toContain('cifhcrlm');
  for(const bad of ['http://127.0.0.1','https://evil.supabase.co',origin+'/x',origin+'.evil.invalid',origin+':444','https://user@klfmscuogsocfjxqkuib.supabase.co'])expect(()=>relayOrigin(bad)).toThrow();
 });
 it.each(['/auth/v1/admin/users','/auth/v1/authorize','/rest/v1/../auth/v1/token','/rest/v1/%2e%2e/token','/storage/v1/object/public/other-bucket/a.png','//evil.invalid/rest/v1/products','/rest/v1/products%252fadmin'])('denies administrative, traversal and unrelated paths: %s',path=>expect(relayPath(path,'POST')).toBe(false));
 it('fails closed before any outgoing request when target is missing',async()=>{const {request,send}=await start({upstream:'https://evil.invalid'});expect((await request('/rest/v1/products')).status).toBe(503);expect(send).not.toHaveBeenCalled();});
 it('relays login JSON byte-for-byte, public key and caller token without private headers',async()=>{
  vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY','must-never-be-forwarded');const {request,send}=await start();const body=JSON.stringify({phone:'synthetic',password:'not-a-real-password'});
  const response=await request('/auth/v1/token?grant_type=password',{method:'POST',headers:{'content-type':'application/json',authorization:'Bearer '+key,cookie:'private-cookie','x-forwarded-for':'forged','x-service-key':'private'},body});
  expect(response.status).toBe(200);expect(send).toHaveBeenCalledOnce();const [url,init]=send.mock.calls[0];expect(url).toBe(origin+'/auth/v1/token?grant_type=password');expect(init.body.toString()).toBe(body);expect(init.headers).toEqual({accept:'*/*',apikey:key,authorization:'Bearer '+key,'content-type':'application/json'});expect(init.redirect).toBe('manual');expect(init.signal).toBeInstanceOf(AbortSignal);
 });
 it('preserves authenticated RLS identity, query filters, ranges and upstream denial',async()=>{
  const {request,send}=await start();send.mockResolvedValue(new Response('{"code":"42501"}',{status:403,headers:{'content-type':'application/json','set-cookie':'secret=bad','access-control-allow-origin':'*'}}));
  const response=await request('/rest/v1/profiles?id=eq.synthetic',{headers:{authorization:'Bearer '+jwt('authenticated'),'accept-profile':'public',range:'0-49'}});
  expect(response.status).toBe(403);expect(await response.json()).toEqual({code:'42501'});expect(send.mock.calls[0][1].headers.authorization).toBe('Bearer '+jwt('authenticated'));expect(response.headers.get('set-cookie')).toBeNull();expect(response.headers.get('access-control-allow-origin')).toBeNull();expect(response.headers.get('cache-control')).toBe('no-store');
 });
 it('preserves exact-count pagination response headers',async()=>{const {request,send}=await start();send.mockResolvedValue(new Response('[]',{status:206,headers:{'content-type':'application/json','content-range':'0-49/66','preference-applied':'count=exact'}}));const response=await request('/rest/v1/products');expect(response.status).toBe(206);expect(response.headers.get('content-range')).toBe('0-49/66');});
 it.each([{apikey:'sb_secret_not-public'},{apikey:jwt('service_role')},{authorization:'Bearer '+jwt('service_role')},{'accept-profile':'inventory_private'},{origin:'https://evil.invalid'},{'sec-fetch-site':'cross-site'}])('rejects private credentials, schemas and cross-site callers %#',async headers=>{const {request,send}=await start();expect((await request('/rest/v1/products',{headers})).status).toBe(403);expect(send).not.toHaveBeenCalled();});
 it('streams supported public and signed images without adding an API or service key',async()=>{const send=vi.fn().mockResolvedValue(new Response(new Uint8Array([1,2,3]),{headers:{'content-type':'image/png'}}));const {base}=await start({send});const response=await fetch(base+'/api/supabase/storage/v1/object/sign/return-request-images/synthetic/image.png?token=synthetic');expect(response.status).toBe(200);expect([...new Uint8Array(await response.arrayBuffer())]).toEqual([1,2,3]);expect(send.mock.calls[0][1].headers.apikey).toBeUndefined();});
 it('does not serve uploaded HTML or SVG as same-origin documents',async()=>{for(const type of ['text/html','image/svg+xml']){const {request,send}=await start();send.mockResolvedValue(new Response('<script/>',{headers:{'content-type':type}}));const response=await request('/storage/v1/object/public/product-images/a');expect(response.status).toBe(502);expect(await response.json()).toEqual({code:'SUPABASE_RELAY_IMAGE_TYPE_DENIED'});}});
 it('forwards multipart upload bytes without JSON parsing',async()=>{const {request,send}=await start();const body='--boundary\r\nContent-Disposition: form-data; name="file"; filename="a.png"\r\n\r\nPNG\r\n--boundary--';const response=await request('/storage/v1/object/product-images/a.png',{method:'POST',headers:{'content-type':'multipart/form-data; boundary=boundary',authorization:'Bearer '+jwt('authenticated')},body});expect(response.status).toBe(200);expect(send.mock.calls[0][1].body.toString()).toBe(body);});
 it('bounds upload memory before forwarding',async()=>{const {request,send}=await start();expect((await request('/storage/v1/object/product-images/a.png',{method:'POST',headers:{'content-type':'image/png'},body:Buffer.alloc(7*1024*1024)})).status).toBe(413);expect(send).not.toHaveBeenCalled();});
 it('rejects redirects without forwarding their location',async()=>{const {request,send}=await start();send.mockResolvedValue(new Response(null,{status:302,headers:{location:'http://private.invalid'}}));const response=await request('/rest/v1/products');expect(response.status).toBe(502);expect(response.headers.get('location')).toBeNull();});
 it('times out and hides raw network diagnostics',async()=>{const send=vi.fn().mockImplementation((_url,init)=>new Promise((_resolve,reject)=>init.signal.addEventListener('abort',()=>reject(Error('secret internal diagnostic')))));const {request}=await start({send,timeoutMs:30});const response=await request('/rest/v1/products');expect(response.status).toBe(504);expect(await response.json()).toEqual({code:'SUPABASE_RELAY_UNAVAILABLE'});});
 it('caps concurrency and releases its slot after completion',async()=>{let release!:(value:Response)=>void;const send=vi.fn().mockImplementation(()=>new Promise(resolve=>{release=resolve;}));const {request}=await start({send,maxConcurrent:1});const pending=request('/rest/v1/products');await vi.waitFor(()=>expect(send).toHaveBeenCalledOnce());expect((await request('/rest/v1/products')).status).toBe(503);release(new Response('{}'));expect((await pending).status).toBe(200);});
});

describe('Supabase SDK through the real HTTP relay',()=>{
 it('completes password login, identity lookup, refresh, upload, signed image and logout',async()=>{
  const id='00000000-0000-4000-8000-000000000001';
  const token='eyJhbGciOiJIUzI1NiJ9.'+Buffer.from(JSON.stringify({role:'authenticated',sub:id,aud:'authenticated',exp:Math.floor(Date.now()/1000)+3600})).toString('base64url')+'.c3ludGhldGlj';
  const user={id,aud:'authenticated',role:'authenticated',phone:'989000000000',app_metadata:{provider:'phone'},user_metadata:{},created_at:'2026-10-26T00:00:00Z'};
  const json=(body:unknown)=>new Response(JSON.stringify(body),{headers:{'content-type':'application/json'}});
  const calls:{path:string;method:string}[]=[];
  const send=vi.fn(async(raw:string,init:RequestInit)=>{
   const url=new URL(raw);expect(url.origin).toBe(origin);calls.push({path:url.pathname+url.search,method:init.method??'GET'});
   const headers=new Headers(init.headers);expect(headers.get('apikey')).toBe(key);expect(headers.get('cookie')).toBeNull();
   if(url.pathname==='/auth/v1/token'){
    const body=JSON.parse(Buffer.from(init.body as Uint8Array).toString());
    if(url.searchParams.get('grant_type')==='password')expect(body).toMatchObject({phone:user.phone,password:'synthetic-password'});
    else expect(body.refresh_token).toBe('synthetic-refresh');
    return json({access_token:token,token_type:'bearer',expires_in:3600,refresh_token:'synthetic-refresh',user});
   }
   expect(headers.get('authorization')).toBe('Bearer '+token);
   if(url.pathname==='/auth/v1/user')return json(user);
   if(url.pathname==='/storage/v1/object/product-images/sdk.png'){
    expect(headers.get('content-type')).toContain('multipart/form-data');expect(Buffer.from(init.body as Uint8Array).toString()).toContain('synthetic-png');
    return json({Id:id,Key:'product-images/sdk.png'});
   }
   if(url.pathname==='/storage/v1/object/sign/product-images/sdk.png'&&init.method==='POST')return json({signedURL:'/object/sign/product-images/sdk.png?token=synthetic'});
   if(url.pathname==='/storage/v1/object/sign/product-images/sdk.png')return new Response('synthetic-png',{headers:{'content-type':'image/png'}});
   if(url.pathname==='/auth/v1/logout')return new Response(null,{status:204});
   throw Error('Unexpected synthetic upstream route');
  });
  const {base}=await start({send});
  const transport=createSupabaseRelayFetch(origin,base,fetch);
  const client=createClient(origin,key,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false},global:{fetch:transport}});
  expect((await client.auth.signInWithPassword({phone:user.phone,password:'synthetic-password'})).error).toBeNull();
  expect((await client.auth.getUser()).data.user?.id).toBe(id);
  expect((await client.auth.refreshSession()).error).toBeNull();
  const upload=await client.storage.from('product-images').upload('sdk.png',new Blob(['synthetic-png'],{type:'image/png'}));
  expect(upload.error).toBeNull();expect(upload.data?.path).toBe('sdk.png');
  const signed=await client.storage.from('product-images').createSignedUrl('sdk.png',60);
  expect(signed.error).toBeNull();expect(signed.data?.signedUrl).toBe(origin+'/storage/v1/object/sign/product-images/sdk.png?token=synthetic');
  expect(await (await transport(signed.data!.signedUrl,{headers:{apikey:key,authorization:'Bearer '+token}})).text()).toBe('synthetic-png');
  expect((await client.auth.signOut()).error).toBeNull();expect((await client.auth.getSession()).data.session).toBeNull();
  expect(calls.some(x=>x.path.includes('grant_type=refresh_token'))).toBe(true);expect(calls.at(-1)?.path).toContain('/auth/v1/logout');
 });
});
