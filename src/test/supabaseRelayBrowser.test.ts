import {describe,expect,it,vi} from 'vitest';
import {createSupabaseRelayFetch,supabaseAssetUrl} from '@/lib/supabaseRelay';
const upstream='https://klfmscuogsocfjxqkuib.supabase.co';
describe('browser Supabase relay transport',()=>{
 it('moves Auth and data requests to this site while preserving session headers and body',async()=>{
  const send=vi.fn().mockResolvedValue(new Response('{}'));const transport=createSupabaseRelayFetch(upstream,'https://jamimode.ir',send);
  await transport(upstream+'/auth/v1/token?grant_type=refresh_token',{method:'POST',headers:{apikey:'sb_publishable_synthetic',authorization:'Bearer synthetic'},body:'{"refresh_token":"synthetic"}'});
  const req=send.mock.calls[0][0] as Request;expect(req.url).toBe('https://jamimode.ir/api/supabase/auth/v1/token?grant_type=refresh_token');expect(req.headers.get('authorization')).toBe('Bearer synthetic');expect(await req.text()).toBe('{"refresh_token":"synthetic"}');expect(req.credentials).toBe('omit');expect(req.redirect).toBe('error');
 });
 it('preserves cancellation and rejects another upstream origin',async()=>{const send=vi.fn().mockResolvedValue(new Response('{}')),controller=new AbortController(),transport=createSupabaseRelayFetch(upstream,'https://jamimode.ir',send);controller.abort();await transport(upstream+'/rest/v1/products',{signal:controller.signal});expect((send.mock.calls[0][0] as Request).signal.aborted).toBe(true);await expect(transport('https://evil.invalid/rest/v1/products')).rejects.toThrow();expect(send).toHaveBeenCalledOnce();});
 it('rewrites stored and signed image display URLs without rewriting metadata or foreign hosts',()=>{
  const original=upstream+'/storage/v1/object/public/product-images/old.jpg';expect(supabaseAssetUrl(original)).toBe('/api/supabase/storage/v1/object/public/product-images/old.jpg');expect(original).toContain(upstream);
  expect(supabaseAssetUrl(upstream+'/storage/v1/object/sign/return-request-images/a.png?token=synthetic')).toContain('/api/supabase/storage/');
  for(const value of ['/placeholder.svg','blob:synthetic','https://other.invalid/a.jpg',upstream+'.evil.invalid/storage/v1/object/public/a'])expect(supabaseAssetUrl(value)).toBe(value);
 });
});
