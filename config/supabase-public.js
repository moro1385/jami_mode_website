// Public configuration only. Never import backend configuration into Vite.
export const TEST_PROJECT_REF = 'cifhcrlmjnsxpkhyloen';
const production = {
  url: 'https://klfmscuogsocfjxqkuib.supabase.co',
  key: 'sb_publishable_12kBSeTHqLjZS56Y-hE_og_cutIUoSN',
};
export function publicSupabaseConfig(env) {
  const localTest = env.MODE === 'local-test';
  if (localTest && Object.keys(env).some(key => key.startsWith('VITE_')
    && !['VITE_SUPABASE_URL', 'VITE_SUPABASE_PUBLISHABLE_KEY'].includes(key))) {
    throw new Error('Unexpected browser environment variable in local test mode');
  }
  const url = env.VITE_SUPABASE_URL || (localTest ? '' : production.url);
  const key = env.VITE_SUPABASE_PUBLISHABLE_KEY || (localTest ? '' : production.key);
  if (!url || !key) throw new Error('Public Supabase configuration is required');
  let parsed;
  try { parsed = new URL(url); } catch { throw new Error('Invalid Supabase URL'); }
  if (parsed.protocol !== 'https:' || parsed.username || parsed.password || parsed.port
      || parsed.pathname !== '/' || parsed.search || parsed.hash) throw new Error('Invalid Supabase URL');
  if (localTest && parsed.hostname !== `${TEST_PROJECT_REF}.supabase.co`) {
    throw new Error('Local test project is not allowlisted');
  }
  // Prefer publishable keys. Accept a legacy anon JWT only outside local-test.
  if (!key.startsWith('sb_publishable_')) {
    if (localTest) throw new Error('Local test requires a publishable browser key');
    try {
      const claims = JSON.parse(atob(key.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
      if (claims.role !== 'anon') throw new Error();
    } catch { throw new Error('A public browser key is required'); }
  }
  return { url: parsed.origin, key, localTest };
}
export function testHtml(html, localTest) {
  return localTest ? html.replace(/<link\b[^>]*rel=["']preconnect["'][^>]*klfmscuogsocfjxqkuib\.supabase\.co[^>]*>/gi, '') : html;
}

export function browserStorageKey(name, mode) {
  return mode === 'local-test' ? `${TEST_PROJECT_REF}:${name}` : name;
}
