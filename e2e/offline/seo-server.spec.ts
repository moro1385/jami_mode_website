import {test,expect} from '@playwright/test';
import express from 'express';import {createServer} from 'node:http';import path from 'node:path';
import {createStorefrontStatic} from '../../server/storefront-static.js';
import {readFile} from 'node:fs/promises';
import {storefrontRobotsRules,storefrontCrawlerAllowed} from '../../scripts/lib/robots-policy.mjs';
// Some Windows ephemeral ports (for example 5061) are blocked by browsers.
// Use a bounded loopback-only port pool; do not disable browser port protections.
async function listenForBrowser(server:ReturnType<typeof createServer>){
 for(let port=4181;port<=4190;port++){
  try{await new Promise<void>((resolve,reject)=>{
   const ready=()=>{server.off('error',failed);resolve();};
   const failed=(error:NodeJS.ErrnoException)=>{server.off('listening',ready);reject(error);};
   server.once('listening',ready);server.once('error',failed);server.listen(port,'127.0.0.1');
  });return;}catch(error){if((error as NodeJS.ErrnoException).code!=='EADDRINUSE')throw error;}
 }
 throw Error('No free loopback port available for browser tests');
}
const row={id:'81000000-0000-4000-8000-000000000002',name:'محصول بررسی SEO',slug:'server-seo-fixture',description:'توضیح عمومی محصول',price:7000,is_active:true,is_out_of_stock:false,is_featured:false,is_new:true,images:['/placeholder.svg'],created_at:'2026-01-01T00:00:00Z',tags:[],sizes:['M'],colors:[],brand:[],type:[],categories:null,product_images:[],product_variants:[]};
for(const javaScriptEnabled of [false,true])test(`initial product metadata stays correct with JavaScript ${javaScriptEnabled?'enabled':'disabled'}`,async({browser})=>{
 const app=express();app.use(createStorefrontStatic(path.resolve('dist'),{readProduct:async()=>({state:'found',product:{slug:row.slug,name:row.name,description:row.description,amount:'7000',soldOut:false,image:'/placeholder.svg'}})}));
 const server=createServer(app);await listenForBrowser(server);const address=server.address();if(!address||typeof address==='string')throw Error();const base='http://127.0.0.1:'+address.port;
 const context=await browser.newContext({javaScriptEnabled});const page=await context.newPage();
 await page.route('**/*',async route=>{const url=new URL(route.request().url());if(url.origin!==base){await route.abort();return;}if(url.pathname.startsWith('/api/')){const body=url.pathname.endsWith('/rest/v1/products')?(route.request().headers().accept?.includes('vnd.pgrst.object')?row:[row]):[];await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(body)});return;}await route.continue();});
 try{
  const response=await page.goto(base+'/product/'+row.slug+'?utm_source=synthetic');expect(response?.status()).toBe(200);
  if(javaScriptEnabled)await expect(page.locator('[data-public-product-summary]')).toHaveCount(0);
  else {await expect(page.locator('[data-public-product-summary]')).toHaveCount(1);await expect(page.locator('[data-product-price]')).toHaveText('۷٬۰۰۰ ریال');await expect(page.locator('[data-product-description]')).toHaveText(row.description);await expect(page.getByRole('link',{name:'مشاهدهٔ فروشگاه',exact:true})).toHaveAttribute('href','/shop');}
  await expect(page.locator('main h1')).toHaveText(row.name);
  await expect(page).toHaveTitle(row.name+' | جامی مد');
  await expect(page.locator('link[rel="canonical"]')).toHaveCount(1);await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href','https://jamimode.ir/product/'+row.slug);
  await expect(page.locator('meta[name="description"]')).toHaveCount(1);await expect(page.locator('meta[name="description"]')).toHaveAttribute('content',row.description);
  await expect(page.locator('script[type="application/ld+json"]')).toHaveCount(2);
  const schema=JSON.parse((await page.locator('#product-structured-data').textContent())!);expect(schema.name).toBe(row.name);expect(schema.offers.price).toBe('7000');
  const trail=JSON.parse((await page.locator('#product-breadcrumbs').textContent())!);expect(trail['@type']).toBe('BreadcrumbList');expect(trail.itemListElement.map((x:{position:number})=>x.position)).toEqual([1,2,3]);expect(trail.itemListElement[2].item).toBe('https://jamimode.ir/product/'+row.slug);
  if(javaScriptEnabled){const nav=page.getByRole('navigation',{name:'مسیر راهنما'});await expect(nav.getByRole('link',{name:'خانه',exact:true})).toHaveAttribute('href','/');await expect(nav.getByRole('link',{name:'فروشگاه',exact:true})).toHaveAttribute('href','/shop');await expect(nav.locator('[aria-current="page"]')).toHaveText(row.name);}

 }finally{await context.close();server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));}
});

test('missing product stays at its URL, removes indexing hints and offers a real shop link',async({browser})=>{
 const app=express();app.use(createStorefrontStatic(path.resolve('dist'),{readProduct:async()=>({state:'missing'})}));
 const server=createServer(app);await listenForBrowser(server);const address=server.address();if(!address||typeof address==='string')throw Error();const base='http://127.0.0.1:'+address.port;
 const context=await browser.newContext();const page=await context.newPage();
 await page.route('**/*',async route=>{const url=new URL(route.request().url());if(url.origin!==base){await route.abort();return;}if(url.pathname.startsWith('/api/')){await route.fulfill({status:200,contentType:'application/json',body:'[]'});return;}await route.continue();});
 try{
  const response=await page.goto(base+'/product/missing-product');expect(response?.status()).toBe(404);
  await expect(page.getByRole('heading',{name:'محصول پیدا نشد',exact:true})).toBeVisible();
  await expect(page).toHaveURL(base+'/product/missing-product');await expect(page).toHaveTitle('محصول پیدا نشد | جامی مد');
  await expect(page.locator('meta[name="robots"]')).toHaveCount(1);await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content','noindex, follow');
  await expect(page.locator('link[rel="canonical"]')).toHaveCount(0);await expect(page.locator('meta[property="og:url"]')).toHaveCount(0);await expect(page.locator('script[type="application/ld+json"]')).toHaveCount(0);
  await page.getByRole('link',{name:'مشاهدهٔ فروشگاه',exact:true}).click();await expect(page).toHaveURL(base+'/shop');await expect(page).toHaveTitle('فروشگاه | جامی مد');await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content','index, follow');await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href','https://jamimode.ir/shop');
 }finally{await context.close();server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));}
});

test('public descriptions agree before and after the application loads',async({browser})=>{
 const app=express();app.use(createStorefrontStatic(path.resolve('dist')));const server=createServer(app);await listenForBrowser(server);const address=server.address();if(!address||typeof address==='string')throw Error();const base='http://127.0.0.1:'+address.port;
 const context=await browser.newContext();const page=await context.newPage();await page.route('**/*',async route=>{const url=new URL(route.request().url());if(url.origin!==base){await route.abort();return;}if(url.pathname.startsWith('/api/')){await route.fulfill({status:200,contentType:'application/json',body:'[]'});return;}await route.continue();});
 try{for(const pathname of ['/about','/faq','/shop','/privacy-policy']){const response=await page.goto(base+pathname);const html=(await response!.body()).toString();const description=html.match(/name="description" content="([^"]+)"/)![1];await expect(page.locator('main h1')).toBeAttached();await expect(page.locator('meta[name="description"]')).toHaveCount(1);await expect(page.locator('meta[name="description"]')).toHaveAttribute('content',description);}}finally{await context.close();server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));}
});

for(const [state,status]of [['missing',404],['unavailable',503]] as const)test('initial '+state+' product message remains readable with JavaScript off',async({browser})=>{
 const app=express();app.use(createStorefrontStatic(path.resolve('dist'),{readProduct:async()=>({state})}));const server=createServer(app);await listenForBrowser(server);const address=server.address();if(!address||typeof address==='string')throw Error();const base='http://127.0.0.1:'+address.port;const context=await browser.newContext({javaScriptEnabled:false});const page=await context.newPage();await page.route('**/*',async route=>{if(new URL(route.request().url()).origin!==base)await route.abort();else await route.continue();});
 try{const response=await page.goto(base+'/product/not-available');expect(response?.status()).toBe(status);await expect(page.locator('[data-public-page-error] h1')).toHaveText(state==='missing'?'محصول پیدا نشد':'دریافت اطلاعات محصول موقتاً ممکن نیست');await expect(page.getByRole('link',{name:'مشاهدهٔ فروشگاه',exact:true})).toBeVisible();await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content','noindex, follow');await expect(page.locator('form')).toHaveCount(0);await expect(page.locator('[data-public-product-summary]')).toHaveCount(0);await expect(page.locator('script[type="application/ld+json"]')).toHaveCount(0);}finally{await context.close();server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));}
});

// Reproduce the actual Search Console failure: the initial HTML is valid,
// but Google's renderer obeys robots.txt for XHR and image subresources too.
for(const policy of ['former','shipped'] as const)test(`crawler rendering with ${policy} robots policy`,async({browser})=>{
 // PostgREST retries each failed fetch; React Query then retries that operation.
 // Retain both real retry layers when reproducing Google's blocked XHR.
 if(policy==='former')test.setTimeout(60000);
 const robots=policy==='shipped'?await readFile(path.resolve('dist/robots.txt'),'utf8')
  :'User-agent: *\nAllow: /\nDisallow: /api/\nSitemap: https://jamimode.ir/sitemap.xml';
 const rules=storefrontRobotsRules(robots),imagePath='/api/supabase/storage/v1/object/public/product-images/crawl-fixture.svg';
 const fixture={...row,images:[imagePath]};
 const app=express();app.use(createStorefrontStatic(path.resolve('dist'),{readProduct:async()=>({state:'found',product:{slug:fixture.slug,name:fixture.name,description:fixture.description,amount:'7000',soldOut:false,image:imagePath}})}));
 const server=createServer(app);await listenForBrowser(server);
 const address=server.address();if(!address||typeof address==='string')throw Error();
 const base='http://127.0.0.1:'+address.port,blocked:string[]=[];
 const context=await browser.newContext();const page=await context.newPage();
 const image=await readFile(path.resolve('public/placeholder.svg'));
 await page.route('**/*',async route=>{
  const url=new URL(route.request().url());
  if(url.origin!==base){await route.abort();return;}
  if(!storefrontCrawlerAllowed(rules,url.pathname+url.search)){
   blocked.push(url.pathname);await route.abort();return;
  }
  if(url.pathname===imagePath){await route.fulfill({status:200,contentType:'image/svg+xml',body:image});return;}
  if(url.pathname.startsWith('/api/')){
   const body=url.pathname.endsWith('/rest/v1/products')?(route.request().headers().accept?.includes('vnd.pgrst.object')?fixture:[fixture]):[];
   await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(body)});return;
  }
  await route.continue();
 });
 try{
  const response=await page.goto(base+'/product/'+fixture.slug);
  expect(response?.status()).toBe(200);
  const initial=(await response!.body()).toString();
  expect(initial).toContain('content="index, follow"');
  expect(initial).toContain('data-public-product-summary');
  if(policy==='former'){
   await expect(page.getByRole('alert')).toContainText('دریافت محصولات ممکن نیست',{timeout:45000});
   await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content','noindex, follow');
   await expect(page.locator('link[rel="canonical"]')).toHaveCount(0);
   expect(blocked.some(p=>p.endsWith('/rest/v1/products'))).toBe(true);
   expect(blocked).toContain(imagePath);
  }else{
   await expect(page.locator('main h1')).toHaveText(fixture.name);
   await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content','index, follow');
   await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href','https://jamimode.ir/product/'+fixture.slug);
   const picture=page.locator('#main-product-image');
   await expect(picture).toBeVisible();
   await expect(picture).toHaveJSProperty('complete',true);
   expect(await picture.evaluate((element:HTMLImageElement)=>element.naturalWidth)).toBeGreaterThan(0);
   expect(blocked).toEqual([]);
  }
 }finally{
  await context.close();server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));
 }
});
