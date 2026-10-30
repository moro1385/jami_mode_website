// @vitest-environment node
import {describe,it,expect} from 'vitest';
import {readFile} from 'node:fs/promises';
import {storefrontRobotsRules,storefrontCrawlerAllowed,inspectStorefrontRobots} from '../../scripts/lib/robots-policy.mjs';
const robots=await readFile(new URL('../../public/robots.txt',import.meta.url),'utf8');
const rules=storefrontRobotsRules(robots);
describe('resources required for Google storefront rendering',()=>{
 it('accepts the shipped policy while rejecting the actual former crawl regression',()=>{
  expect(inspectStorefrontRobots(robots)).toBe(true);
  const previous='User-agent: *\nAllow: /\nDisallow: /api/\nDisallow: /torob_api/\nSitemap: https://jamimode.ir/sitemap.xml';
  expect(()=>inspectStorefrontRobots(previous)).toThrow('robots_policy');
 });
 it.each([
  '/api/supabase/rest/v1/products?select=id%2Cname&slug=eq.%D8%AC%D9%88%D8%B1%D8%A7%D8%A8&is_active=eq.true',
  '/api/supabase/rest/v1/categories?select=id&slug=eq.socks',
  '/api/supabase/rest/v1/product_images?select=image_url&product_id=eq.fixture',
  '/api/supabase/rest/v1/product_variants?select=id&product_id=eq.fixture',
  '/api/supabase/storage/v1/object/public/product-images/fixture.webp',
  '/api/supabase/storage/v1/render/image/public/product-images/fixture.webp?width=400',
  '/account','/checkout/payment','/product/%D8%AC%D9%88%D8%B1%D8%A7%D8%A8',
 ])('allows rendering or reading page noindex at %s',target=>expect(storefrontCrawlerAllowed(rules,target)).toBe(true));
 it.each([
  '/api/supabase/auth/v1/token?grant_type=password','/api/supabase/rest/v1/profiles?select=id',
  '/api/supabase/rest/v1/orders?select=id','/api/supabase/rest/v1/products_private?select=id',
  '/api/supabase/rest/v1/products/other','/api/supabase/rest/v1/rpc/admin_get_orders',
  '/api/supabase/storage/v1/object/sign/product-images/a.webp?token=private',
  '/api/supabase/storage/v1/object/public/return-request-images/a.webp','/api/payments/create','/torob_api/',
 ])('does not widen crawling to %s',target=>expect(storefrontCrawlerAllowed(rules,target)).toBe(false));
 it('detects loss of a required image rule or an overly broad API exception',()=>{
  expect(()=>inspectStorefrontRobots(robots.replace('Allow: /api/supabase/storage/v1/object/public/product-images/',''))).toThrow('robots_policy');
  expect(()=>inspectStorefrontRobots(robots+'\nAllow: /api/supabase/')).toThrow('robots_policy');
  expect(()=>inspectStorefrontRobots(robots+'\nDisallow: /product/')).toThrow('robots_policy');
 });
 it('does not use the exact table exception for another table, and resolves equal rules to Allow',()=>{
  expect(storefrontCrawlerAllowed(rules,'/api/supabase/rest/v1/products')).toBe(true);
  expect(storefrontCrawlerAllowed(rules,'/api/supabase/rest/v1/products_old')).toBe(false);
  const tied=storefrontRobotsRules(robots+'\nDisallow: /shop\nAllow: /shop');
  expect(storefrontCrawlerAllowed(tied,'/shop')).toBe(true);
 });
 it('rejects unsupported crawler-specific policies instead of approving an untested Googlebot group',()=>{
  expect(()=>inspectStorefrontRobots(robots+'\nUser-agent: Googlebot\nDisallow: /')).toThrow('robots_policy');
  expect(()=>inspectStorefrontRobots(robots+'\nDisallow: /*.js$')).toThrow('robots_policy');
 });
});
