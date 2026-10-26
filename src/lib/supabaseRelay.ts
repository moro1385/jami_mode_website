import {publicSupabaseConfig} from '../../config/supabase-public.js';
export const SUPABASE_RELAY_PREFIX='/api/supabase';
export function createSupabaseRelayFetch(upstream:string,siteOrigin:string,send:typeof fetch):typeof fetch {
  const target=new URL(upstream).origin;
  return async(input,init)=>{
    const request=new Request(input,init),url=new URL(request.url);
    if(url.origin!==target)throw Error('Unexpected Supabase destination');
    const options:RequestInit={method:request.method,headers:request.headers,signal:request.signal,credentials:'omit',redirect:'error',cache:'no-store'};
    if(!['GET','HEAD'].includes(request.method)){options.body=await request.arrayBuffer();}
    return send(new Request(siteOrigin+SUPABASE_RELAY_PREFIX+url.pathname+url.search,options));
  };
}
export function supabaseAssetUrl(value:string|undefined|null):string|undefined {
  if(value==null)return undefined;
  if(import.meta.env.MODE==='local-test')return value;
  try {
    const url=new URL(value),base=publicSupabaseConfig({MODE:import.meta.env.MODE,VITE_SUPABASE_URL:import.meta.env.VITE_SUPABASE_URL,VITE_SUPABASE_PUBLISHABLE_KEY:import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}).url;
    if(url.origin===base && /^\/storage\/v1\/(?:object|render)\//.test(url.pathname))return SUPABASE_RELAY_PREFIX+url.pathname+url.search;
  }catch{/* Local assets and object URLs retain their existing behavior. */}
  return value;
}
