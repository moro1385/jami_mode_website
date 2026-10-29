// Validate our owned, uniform robots policy, not arbitrary robots dialects.
// Literal path prefixes and terminal $ use Google's longest-match / Allow-tie
// semantics. Unsupported wildcards and agent-specific groups fail closed so
// the acceptance probe cannot approve a policy it does not understand.
export function storefrontRobotsRules(text) {
 if(typeof text!=='string'||text.length>32768)throw Error('robots_policy');
 const rules=[];let active=false,seen=false,sitemap=false;
 for(const raw of text.split(/\r?\n/)) {
  const line=raw.replace(/#.*/,'').trim();if(!line)continue;
  const colon=line.indexOf(':');if(colon<0)throw Error('robots_policy');
  const name=line.slice(0,colon).trim().toLowerCase(),value=line.slice(colon+1).trim();
  if(name==='user-agent') {
   if(value!=='*')throw Error('robots_policy');
   active=true;seen=true;
  } else if(name==='sitemap') {
   if(value!=='https://jamimode.ir/sitemap.xml')throw Error('robots_policy');
   sitemap=true;
  } else if(name==='allow'||name==='disallow') {
   if(!active)throw Error('robots_policy');
   if(!value)continue;
   if(!value.startsWith('/')||value.includes('*')||value.slice(0,-1).includes('$'))throw Error('robots_policy');
   const exact=value.endsWith('$'),prefix=exact?value.slice(0,-1):value;
   rules.push({allow:name==='allow',prefix,exact,length:Buffer.byteLength(prefix)});
  } else throw Error('robots_policy');
 }
 if(!seen||!sitemap)throw Error('robots_policy');
 return rules;
}
export function storefrontCrawlerAllowed(rules,target) {
 if(typeof target!=='string'||!target.startsWith('/')||target.startsWith('//'))throw Error('robots_policy');
 let winner;
 for(const rule of rules) {
  if(!(rule.exact?target===rule.prefix:target.startsWith(rule.prefix)))continue;
  if(!winner||rule.length>winner.length||rule.length===winner.length&&rule.allow)winner=rule;
 }
 return winner?.allow??true;
}
export function inspectStorefrontRobots(text) {
 const rules=storefrontRobotsRules(text);
 // These are GET resource names, not requests: this validator makes no calls.
 const publicPaths=['/','/shop','/product/crawl-check','/account'];
 for(const table of ['products','categories','product_images','product_variants']) {
  publicPaths.push('/api/supabase/rest/v1/'+table,'/api/supabase/rest/v1/'+table+'?select=id');
 }
 publicPaths.push('/api/supabase/storage/v1/object/public/product-images/crawl-check.webp',
  '/api/supabase/storage/v1/render/image/public/product-images/crawl-check.webp?width=400');
 const privatePaths=['/api/health/live','/api/supabase/auth/v1/token?grant_type=password',
  '/api/supabase/rest/v1/profiles?select=id','/api/supabase/rest/v1/orders?select=id',
  '/api/supabase/rest/v1/products_archive?select=id','/api/supabase/rest/v1/products/other',
  '/api/supabase/rest/v1/rpc/admin_list_users','/api/supabase/storage/v1/object/sign/product-images/a.webp?token=private',
  '/api/supabase/storage/v1/object/public/return-request-images/a.webp','/torob_api/'];
 if(publicPaths.some(p=>!storefrontCrawlerAllowed(rules,p))||privatePaths.some(p=>storefrontCrawlerAllowed(rules,p)))throw Error('robots_policy');
 return true;
}
