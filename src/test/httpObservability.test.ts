// @vitest-environment node
import {afterEach,describe,expect,it,vi} from 'vitest';
import express from 'express';
import {createServer,type Server} from 'node:http';
import {createHttpObservation,requestFamily} from '../../server/http-observability.js';
const servers:Server[]=[];
afterEach(async()=>{for(const server of servers.splice(0)){server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));}});
async function start(observe:ReturnType<typeof createHttpObservation>,handler:express.RequestHandler){
 const app=express();app.use(observe);app.use(handler);const server=createServer(app);servers.push(server);
 await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));const address=server.address();if(!address||typeof address==='string')throw Error();return 'http://127.0.0.1:'+address.port;
}
describe('bounded HTTP observations',()=>{
 it.each([
  ['/api/supabase/auth/v1/token?secret=never','auth'],['/api/supabase/rest/v1/profiles?id=eq.private','data'],
  ['/api/supabase/storage/v1/object/sign/return-request-images/private?token=never','storage'],
  ['/api/bitpay/verify?trans_id=never','checkout'],['/api/wallet/pay','wallet'],['/api/admin/inventory/history','inventory'],
  ['/api/admin/erp/list?parent=private','erp'],['/api/health/maintenance','health'],['/torob_api/v3/products','catalog_feed'],
  ['/api/bitpay-not-a-route/private','api_other'],['/account/private',null],['/assets/app.js',null],
 ])('reduces %s to a fixed family',(path,family)=>expect(requestFamily(path)).toBe(family));
 it('correlates API failures without logging secrets, queries, paths, identity or caller headers',async()=>{
  const write=vi.fn();const base=await start(createHttpObservation({write}),(_req,res)=>res.status(503).json({code:'UNAVAILABLE'}));
  const response=await fetch(base+'/api/supabase/rest/v1/profiles?email=private@example.test',{method:'POST',headers:{authorization:'Bearer never-token',cookie:'session=never-cookie','x-request-id':'never-client-id','content-type':'application/json'},body:'{"password":"never-password"}'});
  expect(response.status).toBe(503);await response.text();await vi.waitFor(()=>expect(write).toHaveBeenCalledOnce());
  const event=JSON.parse(write.mock.calls[0][0]);expect(event).toMatchObject({event:'http_request',family:'data',method:'POST',status:503,outcome:'server_error'});
  expect(event.requestId).toBe(response.headers.get('x-request-id'));expect(event.requestId).toMatch(/^[a-f0-9-]{36}$/);expect(event.durationMs).toBeGreaterThanOrEqual(0);
  for(const raw of ['never','profiles','private@example','authorization','cookie','password','email'])expect(write.mock.calls[0][0]).not.toContain(raw);
  expect(Object.keys(event).sort()).toEqual(['event','requestId','family','method','status','durationMs','outcome'].sort());
 });
 it('does not log routine successful requests or static/page requests',async()=>{
  const write=vi.fn();const base=await start(createHttpObservation({write}),(_req,res)=>res.json({ok:true}));
  const response=await fetch(base+'/api/health/live');expect(response.headers.get('x-request-id')).toBeTruthy();await response.text();
  const page=await fetch(base+'/account');expect(page.headers.get('x-request-id')).toBeNull();await page.text();expect(write).not.toHaveBeenCalled();
 });
 it('records a slow success once, with bounded duration',async()=>{
  let time=0;const write=vi.fn();const base=await start(createHttpObservation({write,clock:()=>time}),(_req,res)=>{time=2500;res.json({ok:true});});
  await(await fetch(base+'/api/bitpay/quote')).text();await vi.waitFor(()=>expect(write).toHaveBeenCalledOnce());expect(JSON.parse(write.mock.calls[0][0])).toMatchObject({outcome:'slow',durationMs:2500,status:200});
 });
 it('bounds log volume and reports suppressed count after the window',async()=>{
  let time=0;const write=vi.fn();const base=await start(createHttpObservation({write,now:()=>time,maxRecords:1,windowMs:1000}),(_req,res)=>res.status(429).json({code:'LIMIT'}));
  for(let n=0;n<3;n++)await(await fetch(base+'/api/health/live')).text();expect(write).toHaveBeenCalledOnce();
  time=1000;await(await fetch(base+'/api/health/live')).text();await vi.waitFor(()=>expect(write).toHaveBeenCalledTimes(3));expect(JSON.parse(write.mock.calls[1][0])).toEqual({event:'http_observation_suppressed',count:2});
 });
 it('records an interrupted response once without an invented status',async()=>{
  const write=vi.fn();const base=await start(createHttpObservation({write}),(_req,res)=>{res.writeHead(200,{'content-type':'text/plain'});res.write('partial');});
  const controller=new AbortController();const response=await fetch(base+'/api/supabase/storage/v1/object/public/product-images/a.png',{signal:controller.signal});controller.abort();await response.text().catch(()=>{});
  await vi.waitFor(()=>expect(write).toHaveBeenCalledOnce());expect(JSON.parse(write.mock.calls[0][0])).toMatchObject({family:'storage',outcome:'aborted',status:null});
 });
 it('never changes API responses when the log sink throws',async()=>{
  const base=await start(createHttpObservation({write:()=>{throw Error('sink unavailable');}}),(_req,res)=>res.status(403).json({code:'DENIED'}));
  const response=await fetch(base+'/api/admin/erp/list');expect(response.status).toBe(403);expect(await response.json()).toEqual({code:'DENIED'});
 });
});
