import {PUBLIC_PAGES,SITE_ORIGIN,productPath} from './seo.js';
export async function sitemapUrls(readPage,{pageSize=500,maxProducts=10000}={}) {
 const urls=new Set(Object.keys(PUBLIC_PAGES).map(path=>SITE_ORIGIN+path));
 let offset=0;
 while(true){
  const rows=await readPage(offset,pageSize);
  if(!Array.isArray(rows)||rows.length>pageSize)throw Error('Invalid sitemap page');
  if(offset+rows.length>maxProducts)throw Error('Sitemap capacity exceeded');
  for(const row of rows){const path=productPath(row?.slug);if(!path)throw Error('Invalid public product slug');urls.add(SITE_ORIGIN+path);}
  offset+=rows.length;
  if(rows.length<pageSize)return [...urls];
 }
}
export function sitemapXml(urls){
 const escape=value=>value.replace(/[<>&'\"]/g,c=>({'<':'&lt;','>':'&gt;','&':'&amp;',"'":'&apos;','"':'&quot;'}[c]));
 return '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'+urls.map(url=>'  <url><loc>'+escape(url)+'</loc></url>').join('\n')+'\n</urlset>\n';
}
