// Explicitly invoked only AFTER approval. Never imported by frontend/backend startup.
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';
import { testBackendConfig, guardedTestFetch } from '../server/test-harness/config.js';
import { authFixtures, checkoutFixtures } from '../supabase/test-bootstrap/fixtures/checkout.js';
export async function seedTestProject(env, transport = globalThis.fetch) {
  const config = testBackendConfig(env);
  const password = env.JAMI_TEST_SEED_PASSWORD;
  if (!password || password.length < 16 || password.startsWith('REPLACE_')) throw new Error('Unique test password required');
  const client = createClient(config.url, config.secret, { auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: guardedTestFetch(transport, true) } });
  const existing = await client.auth.admin.listUsers({ page: 1, perPage: 1 });
  const catalog = await client.from('products').select('id').limit(1);
  if (existing.error || catalog.error || existing.data.users.length || catalog.data.length) {
    throw new Error('Seed requires an empty bootstrapped test project');
  }
  const users = [];
  for (const fixture of authFixtures) {
    const result = await client.auth.admin.createUser({ phone: fixture.phone, password, phone_confirm: true,
      user_metadata: { first_name: fixture.name } });
    if (result.error || !result.data.user) throw new Error('Synthetic Auth seed failed; inspect test project before retrying');
    users.push(result.data.user);
  }
  const fixtures = checkoutFixtures(users);
  for (const table of ['profiles', 'user_roles', 'categories', 'addresses', 'products', 'product_variants']) {
    const query = table === 'profiles' ? client.from(table).upsert(fixtures[table]) : client.from(table).insert(fixtures[table]);
    const { error } = await query;
    if (error) throw new Error('Synthetic table seed failed; inspect test project before retrying');
  }
}
// Importing seed helpers never creates remote users or rows.
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
try { await seedTestProject(process.env); console.log('Synthetic test fixtures created; no provider requests made.'); }
catch { console.error('Synthetic seed refused or failed; inspect the test setup before retrying. No credentials logged.'); process.exitCode = 1; }
}
