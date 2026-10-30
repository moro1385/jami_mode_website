// @vitest-environment node
import {describe,it,expect,vi} from 'vitest';
import {checkSiteDelivery,deliveryAssets,deliveryPolicy} from '../../scripts/lib/site-delivery.mjs';
import {mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import express from 'express';
import {createServer} from 'node:http';
import {createStorefrontStatic} from '../../server/storefront-static.js';
const html='<html><script type="module" src="/assets/index-12345678.js"></script><link rel="stylesheet" href="/assets/index-12345678.css"></html>';
function reply(url:string){const p=new URL(url).pathname;return new Response(p==='/'?html:'',{status:p.includes('__delivery_probe_missing__')?404:200,headers:{'content-type':p.endsWith('.js')?'text/javascript':p.endsWith('.css')?'text/css':p.endsWith('.txt')?'text/plain':'text/html','cache-control':p.includes('12345678')?'public, max-age=31536000, immutable':p.endsWith('.txt')?'public, max-age=0, must-revalidate':'no-store',...(p==='/account'?{'x-robots-tag':'noindex, follow'}:{})}});}
describe('published delivery acceptance',()=>{
 it('checks HTML, private view, revalidation, missing asset and the actual referenced build files',async()=>{const send=vi.fn(async(url:string)=>reply(url));const result=await checkSiteDelivery(undefined,{send});expect(result.result).toBe('ok');expect(send).toHaveBeenCalledTimes(6);for(const [url,options] of send.mock.calls as unknown as [string,RequestInit][]){expect(new URL(url).origin).toBe('https://jamimode.ir');expect(options).toMatchObject({method:'GET',credentials:'omit',redirect:'error',cache:'no-store'});expect(Object.keys(options.headers??{})).toEqual(['accept']);}});
 it.each(['https://evil.invalid','http://jamimode.ir','https://user:password@jamimode.ir','https://jamimode.ir/?key=secret'])('rejects destination %s before I/O',async raw=>{const send=vi.fn();await expect(checkSiteDelivery(raw,{send})).rejects.toThrow();expect(send).not.toHaveBeenCalled();});
 it.each(['https://evil.invalid/assets/index-12345678.js','//evil.invalid/assets/index-12345678.js','/assets/index-12345678.js?token=x','/assets/../account','/assets/index-%31.js'])('never follows unsafe asset reference %s',async src=>{const send=vi.fn(async(url:string)=>url==='https://jamimode.ir/'?new Response(html.replace('/assets/index-12345678.js',src),{headers:{'content-type':'text/html','cache-control':'no-store'}}):reply(url));const result=await checkSiteDelivery(undefined,{send});expect(result.result).toBe('needs_review');expect(send).toHaveBeenCalledTimes(4);});
 it.each([{'cache-control':'public, max-age=60'},{'cache-control':'no-store, s-maxage=60'},{'cache-control':'no-store','cdn-cache-control':'public, max-age=60'},{'cache-control':'no-store','age':'20'},{'cache-control':'no-store','cf-cache-status':'HIT'}])('rejects cacheable private HTML %#',headers=>expect(deliveryPolicy(new Headers(headers),'private')).toBe(false));
 it('accepts uncached edge responses and rejects Set-Cookie on publicly cached build assets',()=>{expect(deliveryPolicy(new Headers({'cache-control':'no-store','cf-cache-status':'DYNAMIC'}),'private')).toBe(true);expect(deliveryPolicy(new Headers({'cache-control':'public, max-age=31536000, immutable','set-cookie':'session=private'}),'asset')).toBe(false);});
 it('does not approve an HTML fallback returned for a missing chunk',async()=>{const result=await checkSiteDelivery(undefined,{send:async(url:string)=>url.includes('__delivery_probe_missing__')?new Response(html,{headers:{'cache-control':'no-store','content-type':'text/html'}}):reply(url)});expect(result.checks.find(c=>c.name==='missing_asset')).toMatchObject({ok:false,status:200,reason:'http_status'});});
 it('caps HTML input and never logs content, raw errors, cookies or token-bearing URL references',async()=>{const result=await checkSiteDelivery(undefined,{send:async(url:string)=>url.endsWith('/')?new Response('private '.repeat(40000),{headers:{'cache-control':'no-store','content-type':'text/html'}}):reply(url)});expect(result.result).toBe('needs_review');expect(result.checks.find(c=>c.name==='home')?.ok).toBe(false);expect(JSON.stringify(result)).not.toContain('private private');});
 it('records unavailable transport without presenting it as a production cache failure',async()=>{const result=await checkSiteDelivery(undefined,{send:async()=>{throw Error('secret diagnostics');}});expect(result.result).toBe('unavailable');expect(JSON.stringify(result)).not.toContain('secret');});
 it('rejects ambiguous build entries',()=>expect(()=>deliveryAssets(html+html,'https://jamimode.ir')).toThrow());
 it('accepts real HTTP headers from production static middleware without accessing the live site',async()=>{
  const folder=await mkdtemp(path.join(tmpdir(),'jami-delivery-probe-'));
  if(path.dirname(path.resolve(folder))!==path.resolve(tmpdir())||!path.basename(folder).startsWith('jami-delivery-probe-'))throw Error('Unsafe cleanup');
  const app=express(),server=createServer(app);
  try{
   await mkdir(path.join(folder,'assets'));
   await writeFile(path.join(folder,'index.html'),html);
   await writeFile(path.join(folder,'robots.txt'),'User-agent: *');
   await writeFile(path.join(folder,'assets/index-12345678.js'),'console.log("fixture")');
   await writeFile(path.join(folder,'assets/index-12345678.css'),'body{}');
   app.use(createStorefrontStatic(folder));
   await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));
   const address=server.address();if(!address||typeof address==='string')throw Error('No local server');
   const result=await checkSiteDelivery(undefined,{send:(url:string,options:RequestInit)=>fetch('http://127.0.0.1:'+address.port+new URL(url).pathname,options)});
   expect(result.result).toBe('ok');expect(result.checks).toHaveLength(6);
  }finally{
   server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));
   await rm(folder,{recursive:true,force:true});
  }
 });
});
