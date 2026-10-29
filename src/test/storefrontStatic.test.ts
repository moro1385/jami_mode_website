// @vitest-environment node
import {afterAll,beforeAll,expect,it} from 'vitest';
import express from 'express';
import {createServer,get,type Server} from 'node:http';
import {mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {createStorefrontStatic} from '../../server/storefront-static.js';
let folder:string,server:Server,base:string;
beforeAll(async()=>{
 folder=await mkdtemp(path.join(tmpdir(),'jami-static-test-'));await mkdir(path.join(folder,'assets'));
 for(const [name,text]of [['index.html','<html>synthetic shell</html>'],['assets/app-Abc12345.js','export const fixture=true;'],['assets/style-Abc12345.css','body{}'],['assets/font-Abc12345.woff2','synthetic-font'],['assets/unhashed.js','synthetic'],['robots.txt','User-agent: *']])await writeFile(path.join(folder,name),text);
 const app=express();app.use('/api',(_req,res)=>res.status(401).set('Cache-Control','no-store').json({error:'synthetic denial'}));app.use(createStorefrontStatic(folder));server=createServer(app);await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));const address=server.address();if(!address||typeof address==='string')throw Error();base='http://127.0.0.1:'+address.port;
});
afterAll(async()=>{server?.closeAllConnections();if(server)await new Promise<void>(resolve=>server.close(()=>resolve()));if(folder){const target=path.resolve(folder);if(!target.startsWith(path.resolve(tmpdir())+path.sep)||!path.basename(target).startsWith('jami-static-test-'))throw Error('Unsafe cleanup');await rm(target,{recursive:true,force:true});}});
it.each(['/assets/app-Abc12345.js','/assets/style-Abc12345.css','/assets/font-Abc12345.woff2'])('caches content-hashed asset %s immutably',async file=>{const response=await fetch(base+file);expect(response.status).toBe(200);expect(response.headers.get('cache-control')).toBe('public, max-age=31536000, immutable');});
it.each(['/','/index.html','/account','/checkout/success?order=synthetic'])('never stores an HTML shell at %s',async file=>{const response=await fetch(base+file);expect(response.status).toBe(200);expect(response.headers.get('cache-control')).toBe('no-store');expect(await response.text()).toContain('synthetic shell');});
it('revalidates public files without a content hash',async()=>{for(const file of ['/robots.txt','/assets/unhashed.js']){const response=await fetch(base+file);expect(response.headers.get('cache-control')).toBe('public, max-age=0, must-revalidate');}});
it('returns a real no-store 404 for an obsolete chunk',async()=>{const response=await fetch(base+'/assets/missing-Abc12345.js');expect(response.status).toBe(404);expect(response.headers.get('cache-control')).toBe('no-store');expect(await response.text()).not.toContain('html');});
it('leaves earlier private APIs out of the static cache',async()=>{const response=await fetch(base+'/api/account',{headers:{authorization:'Bearer synthetic'}});expect(response.status).toBe(401);expect(response.headers.get('cache-control')).toBe('no-store');});
it('supports conditional requests for immutable content',async()=>{const first=await fetch(base+'/assets/app-Abc12345.js');const second=await new Promise<{status:number;cache:string}>(resolve=>{get(base+'/assets/app-Abc12345.js',{headers:{'if-none-match':first.headers.get('etag')!}},response=>{response.resume();response.on('end',()=>resolve({status:response.statusCode!,cache:String(response.headers['cache-control'])}));});});expect(second.status).toBe(304);expect(second.cache).toContain('immutable');});
