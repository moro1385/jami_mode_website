// @vitest-environment node
import {describe,it,expect,vi} from 'vitest';
import {routeSeo,productPath,productJsonLd,serializeJsonLd,publicSeoImage,PUBLIC_PAGES} from '../../config/seo.js';
import {sitemapUrls,sitemapXml} from '../../config/sitemap.js';
describe('public search metadata policy',()=>{
 it.each(['/account','/account/orders','/checkout/success','/signin','/signin/otp','/signup','/admin/users','/cart','/order-tracking','/unknown'])('keeps private or unknown route %s out of indexing',path=>expect(routeSeo(path)).toMatchObject({indexable:false,canonical:null}));
 it('normalizes a Persian product path and strips no invented identifiers',()=>{const path=productPath('جوراب مردانه');expect(routeSeo(path+'/')).toMatchObject({indexable:true,canonical:'https://jamimode.ir'+path});expect(routeSeo('/shop/').canonical).toBe('https://jamimode.ir/shop');});
 it.each(['','../x','a/b','a?secret=x','a#fragment','a\\b','..','%bad\u0000'])('rejects malformed database slug %s',slug=>expect(productPath(slug)).toBeNull());
 it.each(['/product/%E0%A4','/product/%2Fadmin','/product/x?private=1','//evil.invalid'])('does not canonicalize malformed paths %s',path=>expect(routeSeo(path).indexable).toBe(false));
 it('lists only public canonical routes',()=>{for(const path of Object.keys(PUBLIC_PAGES))expect(routeSeo(path)).toMatchObject({indexable:true,canonical:'https://jamimode.ir'+path});});
 it('uses the displayed rial price and availability without inventing reviews',()=>{const schema=productJsonLd({name:'محصول',description:'واقعی',slug:'sock',image:'/photo.webp',amount:'7000',currency:'IRR',soldOut:true});expect(schema.offers).toMatchObject({price:'7000',priceCurrency:'IRR',availability:'https://schema.org/OutOfStock',url:'https://jamimode.ir/product/sock'});expect(schema.image).toEqual(['https://jamimode.ir/photo.webp']);expect(schema).not.toHaveProperty('aggregateRating');expect(productJsonLd({name:'محصول',slug:'sock',amount:'7000',currency:'IRR',soldOut:false}).offers.availability).toBe('https://schema.org/InStock');});
 it.each(['NaN','Infinity','-10','0','',' '])('omits an invalid or non-purchasable price %s',amount=>expect(productJsonLd({name:'محصول',slug:'sock',amount,currency:'IRR',soldOut:false})).not.toHaveProperty('offers'));
 it('escapes script terminators while retaining valid JSON',()=>{const raw={name:'</script><script>alert("x")</script>&\u2028'};const output=serializeJsonLd(raw);expect(output).not.toContain('<');expect(output).not.toContain('&');expect(JSON.parse(output)).toEqual(raw);});
 it.each(['javascript:alert(1)','//evil.invalid/a.jpg','https://u:password@a.invalid/photo.jpg','/api/supabase/storage/v1/object/sign/private/p.jpg?token=secret','/placeholder.svg'])('omits unsafe or placeholder image %s',value=>expect(publicSeoImage(value)).toBeUndefined());
});
describe('paginated sitemap',()=>{
 it('includes products beyond the first thousand and has no duplicate or filtered canonical entries',async()=>{const rows=Array.from({length:1201},(_,i)=>({slug:'sock-'+i}));const read=vi.fn(async(offset:number,size:number)=>rows.slice(offset,offset+size));const urls=await sitemapUrls(read);expect(read.mock.calls).toEqual([[0,500],[500,500],[1000,500]]);expect(urls).toContain('https://jamimode.ir/product/sock-1200');expect(urls.length).toBe(1201+Object.keys(PUBLIC_PAGES).length);expect(urls.every(url=>!url.includes('?'))).toBe(true);});
 it('rejects failed reads instead of returning a partial sitemap',async()=>{let count=0;await expect(sitemapUrls(async()=>{if(count++)throw Error('private upstream message');return [{slug:'ok'}];},{pageSize:1})).rejects.toThrow();});
 it('deduplicates canonical products and escapes XML',async()=>{const urls=await sitemapUrls(async()=>[{slug:'sock&"<x>'},{slug:'sock&"<x>'}]);expect(urls.filter(url=>url.includes('/product/'))).toHaveLength(1);expect(sitemapXml(['https://jamimode.ir/a?x=1&y="<>'])).toContain('&amp;y=&quot;&lt;&gt;');});
 it('fails on malformed slugs and bounded capacity instead of publishing broken URLs',async()=>{await expect(sitemapUrls(async()=>[{slug:'bad/path'}])).rejects.toThrow();await expect(sitemapUrls(async()=>[{slug:'x'}],{pageSize:1,maxProducts:1})).rejects.toThrow('capacity');});
});


it('covers every public page with a distinct bounded description',async()=>{const {PAGE_DESCRIPTIONS,routeDescription}=await import('../../config/seo.js');expect(Object.keys(PAGE_DESCRIPTIONS).sort()).toEqual(Object.keys(PUBLIC_PAGES).sort());expect(new Set(Object.values(PAGE_DESCRIPTIONS)).size).toBe(Object.keys(PUBLIC_PAGES).length);for(const [path,description]of Object.entries(PAGE_DESCRIPTIONS)){expect(String(description).length).toBeGreaterThan(20);expect(String(description).length).toBeLessThan(160);expect(routeDescription(path==='/shop'?path+'/':path)).toBe(description);}});

it('shares the exact visible product trail and canonical encoded slug',async()=>{const {productBreadcrumbs}=await import('../../config/seo.js');const trail=productBreadcrumbs({name:'جوراب مردانه',slug:'جوراب مردانه'});expect(trail.itemListElement).toEqual([
 {'@type':'ListItem',position:1,name:'خانه',item:'https://jamimode.ir/'},
 {'@type':'ListItem',position:2,name:'فروشگاه',item:'https://jamimode.ir/shop'},
 {'@type':'ListItem',position:3,name:'جوراب مردانه',item:'https://jamimode.ir/product/'+encodeURIComponent('جوراب مردانه')},
]);expect(productBreadcrumbs({name:' ',slug:'valid'})).toBeNull();expect(productBreadcrumbs({name:'name',slug:'bad/path'})).toBeNull();});
