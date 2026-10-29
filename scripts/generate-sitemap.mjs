import {createClient} from '@supabase/supabase-js';
import {writeFile,rename,unlink} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {randomUUID} from 'node:crypto';
import {publicSupabaseConfig} from '../config/supabase-public.js';
import {sitemapUrls,sitemapXml} from '../config/sitemap.js';
const config=publicSupabaseConfig({MODE:'production'});
const client=createClient(config.url,config.key,{auth:{persistSession:false,autoRefreshToken:false}});
const destination=fileURLToPath(new URL('../public/sitemap.xml',import.meta.url));
const temporary=destination+'.'+randomUUID()+'.tmp';
try {
 const signal=AbortSignal.timeout(60000);
 const urls=await sitemapUrls(async(offset,size)=>{
  const {data,error}=await client.from('products').select('slug').eq('is_active',true).order('id',{ascending:true}).range(offset,offset+size-1).abortSignal(signal);
  if(error)throw Error('Catalog read failed');return data;
 });
 await writeFile(temporary,sitemapXml(urls),{encoding:'utf8',flag:'wx'});
 await rename(temporary,destination);
 console.log(JSON.stringify({event:'sitemap_generated',urls:urls.length}));
}catch{
 // Never replace the previous sitemap with partial data or expose upstream text.
 console.error(JSON.stringify({event:'sitemap_generation_failed'}));process.exitCode=1;
}finally{await unlink(temporary).catch(()=>{});}
