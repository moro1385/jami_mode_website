import express from 'express';
import {Readable} from 'node:stream';
import {pipeline} from 'node:stream/promises';
import {createRateLimiter} from './http-security.js';

const projects = new Set(['klfmscuogsocfjxqkuib', 'cifhcrlmjnsxpkhyloen']);
const requestHeaders = ['apikey','authorization','accept','content-type','accept-profile','content-profile','prefer','range','range-unit','x-upsert','x-client-info','x-supabase-api-version'];
const responseHeaders = ['content-type','content-range','range-unit','preference-applied'];
export function relayOrigin(value) {
  const url = new URL(value);
  if (url.protocol !== 'https:' || url.username || url.password || url.port || url.pathname !== '/' || url.search || url.hash || !projects.has(url.hostname.replace(/\.supabase\.co$/, '')) || !url.hostname.endsWith('.supabase.co')) throw Error('Invalid Supabase relay target');
  return url.origin;
}
export function relayPath(raw, method) {
  if (typeof raw !== 'string' || raw.length > 16000) return false;
  const path = raw.split('?')[0];
  if (!path.startsWith('/') || /[\\\u0000-\u0020]|\/\/|%(?:2e|2f|5c|25|00)/i.test(path)) return false;
  let decoded;
  try { decoded = decodeURIComponent(path); } catch { return false; }
  if (decoded.split('/').some(x => x === '.' || x === '..') || /[\\\u0000-\u001f\u007f]/.test(decoded)) return false;
  const auth = {
    token:['POST'],user:['GET','PUT'],logout:['POST'],otp:['POST'],verify:['POST'],signup:['POST'],recover:['POST'],resend:['POST'],reauthenticate:['GET'],settings:['GET'],health:['GET'],
  };
  const endpoint = path.match(/^\/auth\/v1\/([a-z]+)$/)?.[1];
  if (endpoint) return auth[endpoint]?.includes(method) ?? false;
  if (/^\/rest\/v1\/(?:[a-z_][a-z0-9_]*|rpc\/[a-z_][a-z0-9_]*)$/.test(path)) return ['GET','HEAD','POST','PATCH','DELETE'].includes(method);
  if(/^\/storage\/v1\/render\/image\/(?:public|sign)\/(?:product-images|return-request-images)\/.+$/.test(path))return ['GET','HEAD'].includes(method);
  return /^\/storage\/v1\/object\/(?:public\/|sign\/)?(?:product-images|return-request-images)(?:\/.+)?$/.test(path) && ['GET','HEAD','POST','PUT','DELETE'].includes(method);
}
function publicKey(key) {
  if (typeof key !== 'string' || key.length > 8192) return false;
  if (/^sb_publishable_[A-Za-z0-9_-]+$/.test(key)) return true;
  try { return JSON.parse(Buffer.from(key.split('.')[1], 'base64url').toString()).role === 'anon'; } catch { return false; }
}
function permittedAuthorization(value) {
  if (value === undefined) return true;
  if (typeof value !== 'string' || value.length > 16384 || !value.startsWith('Bearer ')) return false;
  const token = value.slice(7);
  if (publicKey(token)) return true;
  try { return JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString()).role === 'authenticated'; } catch { return false; }
}

// This is a bounded public-client relay. It never supplies service-role credentials.
export function createSupabaseRelay({upstream=process.env.SUPABASE_URL,send=(...args)=>fetch(...args),timeoutMs=30000,maxConcurrent=8,maxResponseBytes=32*1024*1024}={}) {
  const router=express.Router(); let active=0;
  let origin;
  try { origin=relayOrigin(upstream); } catch { /* Missing configuration fails closed. */ }
  const authLimit=createRateLimiter({limit:20});
  router.use(createRateLimiter({limit:300}));
  router.use((req,res,next)=>{
    res.set({'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','Content-Security-Policy':"default-src 'none'; frame-ancestors 'none'; sandbox"});
    if (!origin) return res.status(503).json({code:'SUPABASE_RELAY_UNAVAILABLE'});
    if (!relayPath(req.url,req.method)) return res.status(404).json({code:'SUPABASE_RELAY_ROUTE_DENIED'});
    if (req.headers.origin && req.headers.origin !== `${req.protocol}://${req.get('host')}`) return res.status(403).json({code:'SUPABASE_RELAY_ORIGIN_DENIED'});
    if (req.headers['sec-fetch-site']==='cross-site') return res.status(403).json({code:'SUPABASE_RELAY_ORIGIN_DENIED'});
    const asset=/^\/storage\/v1\/(?:object|render\/image)\/(public|sign)\//.test(req.url) && ['GET','HEAD'].includes(req.method);
    if ((!asset && !publicKey(req.headers.apikey)) || !permittedAuthorization(req.headers.authorization)) return res.status(403).json({code:'SUPABASE_RELAY_PUBLIC_CLIENT_REQUIRED'});
    if (['accept-profile','content-profile'].some(name=>req.headers[name] && req.headers[name]!=='public')) return res.status(403).json({code:'SUPABASE_RELAY_SCHEMA_DENIED'});
    if (active>=maxConcurrent) return res.status(503).set('Retry-After','2').json({code:'SUPABASE_RELAY_BUSY'});
    req.setTimeout(30000,()=>req.destroy());
    active++;let released=false;const release=()=>{if(!released){released=true;active--;}};res.once('finish',release);res.once('close',release);
    if(req.url.startsWith('/auth/v1/') && !['GET','HEAD'].includes(req.method)) return authLimit(req,res,next);
    next();
  });
  router.use(express.raw({type:()=>true,limit:'6mb',inflate:false}));
  router.use(async(req,res)=>{
    const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),timeoutMs);
    const abort=()=>controller.abort();req.once('aborted',abort);res.once('close',abort);
    try {
      const headers={};for(const name of requestHeaders)if(typeof req.headers[name]==='string')headers[name]=req.headers[name];
      // Host, cookies, forwarding chains, service keys and provider Set-Cookie are never copied.
      const response=await send(origin+req.url,{method:req.method,headers,body:['GET','HEAD'].includes(req.method)?undefined:req.body,redirect:'manual',signal:controller.signal});
      if(response.status>=300 && response.status<400){await response.body?.cancel();return res.status(502).json({code:'SUPABASE_RELAY_REDIRECT_DENIED'});}
      if(req.url.startsWith('/storage/v1/') && ['GET','HEAD'].includes(req.method) && response.ok && !/^image\/(?:jpeg|png|webp|gif|avif)(?:;|$)/i.test(response.headers.get('content-type')??'')){
        await response.body?.cancel();return res.status(502).json({code:'SUPABASE_RELAY_IMAGE_TYPE_DENIED'});
      }
      res.status(response.status);for(const name of responseHeaders){const value=response.headers.get(name);if(value)res.set(name,value);}
      if(!response.body || req.method==='HEAD'){await response.body?.cancel();res.end();return;}
      const stream=Readable.fromWeb(response.body);let bytes=0;stream.on('data',chunk=>{bytes+=chunk.length;if(bytes>maxResponseBytes){controller.abort();stream.destroy(Error('Response limit'));}});
      await pipeline(stream,res);
    } catch {
      if(!res.headersSent && !res.destroyed)res.status(controller.signal.aborted?504:502).json({code:'SUPABASE_RELAY_UNAVAILABLE'});
      else if(!res.destroyed)res.destroy();
    } finally {clearTimeout(timer);req.off('aborted',abort);res.off('close',abort);}
  });
  router.use((error,_req,res,_next)=>res.status(error?.type==='entity.too.large'?413:error?.status===415?415:400).json({code:'SUPABASE_RELAY_INVALID_BODY'}));
  return router;
}
