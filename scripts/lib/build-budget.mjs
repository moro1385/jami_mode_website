import {gzipSync} from 'node:zlib';
export function buildAssetPath(value){
 if(typeof value!=='string'||!value||value.includes('\\')||value.includes('?')||value.includes('#')||value.startsWith('//'))throw Error('Invalid build asset');
 const path=value.startsWith('/')?value.slice(1):value;
 if(!path.startsWith('assets/')||path.split('/').some(part=>!part||part==='.'||part==='..')||/[%\u0000-\u001f]/.test(path))throw Error('Invalid build asset');
 return path;
}
export async function inspectBuildBudget({manifest,html,read,limits}){
 if(!manifest||!Object.hasOwn(manifest,'index.html')||!manifest['index.html']?.isEntry)throw Error('Missing build entry');
 for(const key of ['initialJsBytes','initialGzipBytes','initialCssBytes','preloadedFontBytes'])if(!Number.isSafeInteger(limits[key])||limits[key]<=0)throw Error('Invalid budget');
 const seen=new Set(),js=new Set(),css=new Set(),fonts=new Set();
 function visit(key){
  if(seen.has(key))return;seen.add(key);
  if(!Object.hasOwn(manifest,key))throw Error('Missing static import');
  const chunk=manifest[key];js.add(buildAssetPath(chunk.file));
  if(chunk.imports!==undefined&&!Array.isArray(chunk.imports))throw Error('Invalid static imports');
  if(chunk.css!==undefined&&!Array.isArray(chunk.css))throw Error('Invalid stylesheets');
  for(const file of chunk.css??[])css.add(buildAssetPath(file));
  for(const dependency of chunk.imports??[])visit(dependency);
  // dynamicImports intentionally belong to later route visits.
 }
 visit('index.html');
 const attribute=(tag,key)=>tag.match(new RegExp('\\b'+key+'\\s*=\\s*["\x27]([^"\x27]*)["\x27]','i'))?.[1];
 for(const tag of html.match(/<link\b[^>]*>/gi)??[])if(attribute(tag,'rel')?.toLowerCase()==='preload'&&attribute(tag,'as')?.toLowerCase()==='font')fonts.add(buildAssetPath(attribute(tag,'href')));
 let initialJsBytes=0,initialGzipBytes=0,initialCssBytes=0,preloadedFontBytes=0;
 async function bytes(file){const value=Buffer.from(await read(file));if(value.length>10_000_000)throw Error('Oversized build asset');return value;}
 for(const file of js){const value=await bytes(file);initialJsBytes+=value.length;initialGzipBytes+=gzipSync(value).length;}
 for(const file of css)initialCssBytes+=(await bytes(file)).length;
 for(const file of fonts)preloadedFontBytes+=(await bytes(file)).length;
 const measured={initialJsBytes,initialGzipBytes,initialCssBytes,preloadedFontBytes};
 const exceeded=Object.keys(measured).filter(key=>measured[key]>limits[key]);
 return {result:exceeded.length?'over_budget':'ok',measured,limits,exceeded,assets:{js:[...js],css:[...css],preloadedFonts:[...fonts]}};
}
