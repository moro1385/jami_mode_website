// @vitest-environment node
import { describe, it, expect, vi } from 'vitest';
import { publicSupabaseConfig, testHtml, TEST_PROJECT_REF, browserStorageKey } from '../../config/supabase-public.js';
import { testBackendConfig, guardedTestFetch, TEST_ORIGIN } from '../../server/test-harness/config.js';
import { validateBootstrap } from '../../scripts/check-test-bootstrap.mjs';
import { checkoutFixtures } from '../../supabase/test-bootstrap/fixtures/checkout.js';
import { readFileSync } from 'node:fs';
const publicEnv = { MODE: 'local-test', VITE_SUPABASE_URL: TEST_ORIGIN, VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_synthetic' };
const backendEnv = { JAMI_TEST_SUPABASE_URL: TEST_ORIGIN, JAMI_TEST_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_synthetic', JAMI_TEST_SUPABASE_SECRET_KEY: 'sb_secret_synthetic' };
describe('isolated fresh test bootstrap', () => {
  it('covers all originals exactly once, checks hashes and dependency order', () => {
    expect(validateBootstrap().migrations).toHaveLength(26);
  });
  it('contains no synthetic Auth replacement or hostile fixture imports', () => {
    const script = readFileSync('supabase/test-bootstrap/bootstrap.psql', 'utf8');
    expect(script).not.toMatch(/containment-before|fixtures\/auth/);
    const fixes = readFileSync('supabase/test-bootstrap/fixes.sql', 'utf8');
    expect(fixes).toContain('GRANT UPDATE(status)');
    expect(fixes).toContain('REFERENCES public.profiles(id)');
    expect(fixes).toContain('FOR SELECT TO anon, authenticated USING (is_active)');
    expect(fixes).not.toMatch(/GRANT ALL.*authenticated/);
  });
  it('seeds fresh catalog/options, separate ownership, empty stock and zero balances', () => {
    const fixtures = checkoutFixtures([{ id: 'buyer1' }, { id: 'buyer2' }, { id: 'admin' }]);
    expect(fixtures.addresses.map(a => a.user_id)).toEqual(['buyer1', 'buyer2']);
    expect(fixtures.profiles.every(p => p.wallet_balance === 0)).toBe(true);
    expect(fixtures.product_variants.map(v => v.stock_quantity)).toEqual([2, 0]);
    expect(fixtures.products.some(p => !p.is_active)).toBe(true);
    expect(fixtures.products.some(p => p.is_out_of_stock)).toBe(true);
  });
});
describe('test configuration boundaries', () => {
  it('requires exact test origin and a public browser key', () => {
    expect(publicSupabaseConfig(publicEnv).url).toBe(`https://${TEST_PROJECT_REF}.supabase.co`);
    for (const url of ['', 'https://klfmscuogsocfjxqkuib.supabase.co', TEST_ORIGIN + '.evil.invalid', TEST_ORIGIN + '/x']) {
      expect(() => publicSupabaseConfig({ ...publicEnv, VITE_SUPABASE_URL: url })).toThrow();
    }
    for (const key of ['', 'sb_secret_synthetic', 'eyJ.synthetic']) {
      expect(() => publicSupabaseConfig({ ...publicEnv, VITE_SUPABASE_PUBLISHABLE_KEY: key })).toThrow();
    }
  });
  it('rejects unexpected Vite variables and isolates persisted browser state', () => {
    expect(() => publicSupabaseConfig({ ...publicEnv, VITE_EXTRA_KEY: 'sb_secret_synthetic' })).toThrow();
    expect(browserStorageKey('cart', 'local-test')).toBe(TEST_PROJECT_REF + ':cart');
    expect(browserStorageKey('cart', 'production')).toBe('cart');
  });
  it('preserves default production behavior and removes only the test preconnect', () => {
    expect(publicSupabaseConfig({ MODE: 'production' }).url).toBe('https://klfmscuogsocfjxqkuib.supabase.co');
    const html = readFileSync('index.html', 'utf8');
    expect(testHtml(html, true)).not.toContain('klfmscuogsocfjxqkuib.supabase.co');
    expect(testHtml(html, false)).toBe(html);
  });
  it('rejects wrong backend project, payment credentials and browser secrets', () => {
    expect(testBackendConfig(backendEnv).url).toBe(TEST_ORIGIN);
    expect(() => testBackendConfig({ ...backendEnv, JAMI_TEST_SUPABASE_URL: 'https://klfmscuogsocfjxqkuib.supabase.co' })).toThrow();
    expect(() => testBackendConfig({ ...backendEnv, BITPAY_API_KEY: 'synthetic' })).toThrow();
    expect(() => testBackendConfig({ ...backendEnv, VITE_SUPABASE_SERVICE_ROLE_KEY: 'synthetic' })).toThrow();
    expect(() => testBackendConfig({ ...backendEnv, JAMI_TEST_SUPABASE_SECRET_KEY: 'eyJ.synthetic' })).toThrow();
  });
  it('permits recovery RPCs and read-only receipts only on the pinned test project', async () => {
    const transport = vi.fn().mockResolvedValue(new Response('{}'));
    const safe = guardedTestFetch(transport);
    for (const name of ['trusted_verification_claim', 'trusted_verification_record', 'trusted_reconcile_verified']) {
      await safe(TEST_ORIGIN + '/rest/v1/rpc/' + name, { method: 'POST' });
    }
    await safe(TEST_ORIGIN + '/rest/v1/orders?select=id', { method: 'GET' });
    await expect(safe(TEST_ORIGIN + '/rest/v1/orders', { method: 'DELETE' })).rejects.toThrow('blocked');
    await expect(safe(new Request(TEST_ORIGIN + '/rest/v1/orders', { method: 'PATCH' }))).rejects.toThrow('blocked');
    expect(transport).toHaveBeenCalledTimes(4);
  });
  it('blocks provider URLs, production, arbitrary endpoints and redirect following before transport', async () => {
    const transport = vi.fn().mockResolvedValue(new Response('{}'));
    const safe = guardedTestFetch(transport);
    for (const url of ['https://bitpay.ir/payment-test/gateway-send', 'https://klfmscuogsocfjxqkuib.supabase.co/auth/v1/user', TEST_ORIGIN + '/rest/v1/profiles', TEST_ORIGIN + '/auth/v1/admin/users']) {
      await expect(safe(url)).rejects.toThrow('blocked');
    }
    await expect(safe(TEST_ORIGIN + '/auth/v1/user', { redirect: 'follow' })).rejects.toThrow('blocked');
    expect(transport).not.toHaveBeenCalled();
    await safe(TEST_ORIGIN + '/auth/v1/user');
    expect(transport.mock.calls[0][1].redirect).toBe('error');
  });
});
