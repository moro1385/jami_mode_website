import {readFile} from 'node:fs/promises';
import {pageSeo,renderPageSeo} from './page-seo.js';
import express from 'express';
import path from 'node:path';

// Mount after all API handlers. Only content-hashed build assets are immutable.
export function createStorefrontStatic(directory,{readProduct=async()=>({state:'unavailable'})}={}) {
 const root=path.resolve(directory),router=express.Router();
 let template;
 async function render(req,res,next){
  try{
   template??=await readFile(path.join(root,'index.html'),'utf8');
   const meta=await pageSeo(req.path,readProduct);
   res.set('Cache-Control','no-store');
   if(!meta.indexable)res.set('X-Robots-Tag','noindex, follow');
   if(meta.status===503)res.set('Retry-After','30');
   res.status(meta.status).type('html').send(renderPageSeo(template,meta));
  }catch(error){next(error);}
 }
 router.get('/index.html',(_req,res)=>res.set('Cache-Control','no-store').redirect(308,'/'));
 router.use(express.static(root,{index:false,redirect:false,dotfiles:'deny',setHeaders(res,file){
  const relative=path.relative(root,file).split(path.sep).join('/');
  const hashed=relative.startsWith('assets/')&&/^.+-[A-Za-z0-9_-]{8,}\.(js|css|woff2|png|jpe?g|webp|svg|avif)$/.test(path.basename(file));
  res.setHeader('Cache-Control',relative==='index.html'?'no-store':hashed?'public, max-age=31536000, immutable':'public, max-age=0, must-revalidate');
 }}));
 // An obsolete chunk must be a real 404, never a successful HTML response.
 router.get('/assets/*',(_req,res)=>res.status(404).set('Cache-Control','no-store').end());
 router.get('*',render);
 return router;
}
