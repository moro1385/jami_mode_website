// Fresh, loopback-only PostgreSQL cluster. Never accepts a connection URL and
// never loads .env or Supabase's linked-project config. No production access.
import { execFileSync, spawn } from 'node:child_process';
import { mkdtempSync, rmSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'node:net';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const directory = mkdtempSync(join(tmpdir(), 'jami-containment-'));
const data = join(directory, 'data');
const binary = (name) => process.env.JAMI_TEST_PG_BIN
  ? join(process.env.JAMI_TEST_PG_BIN, name + (process.platform === 'win32' ? '.exe' : ''))
  : name;
// Do not inherit database connection settings, service files or passwords.
const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.toUpperCase().startsWith('PG')));
// Also prevent libpq from opening the user's default password/service files.
env.PGPASSFILE = join(directory, 'no-password-file');
env.PGSERVICEFILE = join(directory, 'no-service-file');
env.PGSYSCONFDIR = directory;
const run = (name, args) => execFileSync(binary(name), args, {
  cwd: root, env, windowsHide: true, encoding: 'utf8', timeout: 60000,
  // Windows postgres can inherit pg_ctl's pipe handles after pg_ctl exits.
  // No captured handles may be inherited by the long-lived server process.
  stdio: name === 'pg_ctl' ? 'ignore' : 'pipe',
});
const server = createServer();
await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
const port = server.address().port;
await new Promise(resolve => server.close(resolve));
let started = false;
let failed = false;
try {
  run('initdb', ['-D', data, '-U', 'postgres', '-A', 'trust', '--encoding=UTF8', '--no-locale']);
  // TCP only: distro defaults may point Unix sockets at /var/run/postgresql,
  // which an unprivileged CI runner cannot write. Clients already pin loopback.
  run('pg_ctl', ['-D', data, '-l', join(directory, 'postgres.log'), '-o', `-h 127.0.0.1 -p ${port} -c unix_socket_directories=`, '-w', 'start']);
  started = true;
  let testDatabase = 'postgres';
  const psql = (...args) => run('psql', ['-X', '-A', '-t', '-w', '-h', '127.0.0.1', '-p', String(port), '-U', 'postgres', '-d', testDatabase, '-v', 'ON_ERROR_STOP=1', ...args]);
  // Explicit dependency-correct subset; NOT a claim that historical migrations
  // replay cleanly. See docs/security-containment.md for the baseline limitation.
  const baseline = [
    '20260817121647_cb255752-e179-4ab4-8fd9-fa53002fe795.sql',
    '20260817121702_1fe1a749-b749-4285-a54f-8c8a6d547e42.sql',
    '20260901000000_checkout_schema.sql',
    '20260901000001_checkout_schema_fix.sql',
    '20260902000000_fix_orders_rls_and_address.sql',
    '20260921122000_add_bitpay_columns.sql',
    '20260922000000_create_wallet_topups.sql',
  ];
  const prepareDatabase = () => {
    psql('-f', 'supabase/tests/fixtures/auth.sql');
    for (const file of baseline) psql('-f', `supabase/migrations/${file}`);
    psql('-f', 'supabase/tests/fixtures/containment-before.sql');
  };
  prepareDatabase();
  psql('-f', 'supabase/migrations/20261017143036_first_security_containment.sql');
  const result = psql('-f', 'supabase/tests/security_containment.sql');
  process.stdout.write(result);
  console.log(`Permission assertions: ${(result.match(/^PASS:/gm) || []).length} passed.`);
  // Diagnostic, not an acceptance claim: hold an INSERT before its RLS check,
  // commit initiation in another connection, then release the same statement.
  // Its READ COMMITTED snapshot can still see the uninitialized parent.
  psql('-c', `INSERT INTO public.orders(id,user_id,status,payment_method,total_amount)
    VALUES('20000000-0000-0000-0000-000000000099','10000000-0000-0000-0000-000000000001','pending_payment','gateway',1000);
    CREATE FUNCTION public.fixture_item_race_gate() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN RAISE NOTICE 'ITEM_RACE_READY'; PERFORM pg_advisory_xact_lock(19717199); RETURN NEW; END $$;
    CREATE TRIGGER fixture_item_race_gate BEFORE INSERT ON public.order_items
    FOR EACH ROW EXECUTE FUNCTION public.fixture_item_race_gate();`);
  const interactive = () => {
    const child = spawn(binary('psql'), ['-X', '-A', '-t', '-w', '-h', '127.0.0.1', '-p', String(port), '-U', 'postgres', '-d', testDatabase, '-v', 'ON_ERROR_STOP=1'], { cwd: root, env, windowsHide: true, stdio: 'pipe' });
    let output = '';
    const listeners = [];
    const timer = setTimeout(() => child.kill(), 15000);
    for (const stream of [child.stdout, child.stderr]) stream.on('data', data => { output += data; for (const listener of listeners) listener(); });
    const done = new Promise((resolve, reject) => {
      child.on('error', reject);
      child.on('close', code => { clearTimeout(timer); code === 0 ? resolve(output) : reject(new Error(`Race session failed (${code}): ${output}`)); });
    });
    const until = marker => Promise.race([new Promise(resolve => {
      const check = () => { if (output.includes(marker)) resolve(); };
      listeners.push(check); check();
    }), done.then(() => { throw new Error(`Race session ended before ${marker}`); })]);
    return { child, until, done };
  };
  const locker = interactive();
  const inserter = interactive();
  try {
    locker.child.stdin.write("SELECT pg_advisory_lock(19717199);\n\\echo LOCK_READY\n");
    await locker.until('LOCK_READY');
    inserter.child.stdin.end(`SET ROLE authenticated;
      SELECT set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000001',false);
      INSERT INTO public.order_items(order_id,quantity,price)
      VALUES('20000000-0000-0000-0000-000000000099',1,1);\n`);
    await inserter.until('ITEM_RACE_READY');
    locker.child.stdin.end(`SET ROLE service_role;
      UPDATE public.orders SET payment_ref='race-init-ref' WHERE id='20000000-0000-0000-0000-000000000099';
      SELECT pg_advisory_unlock(19717199);\n`);
    await Promise.all([locker.done, inserter.done]);
  } finally {
    locker.child.kill(); inserter.child.kill();
  }
  psql('-c', `DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM public.order_items i JOIN public.orders o ON o.id=i.order_id
      WHERE o.id='20000000-0000-0000-0000-000000000099' AND o.payment_ref='race-init-ref')
    THEN RAISE EXCEPTION 'Expected containment snapshot-race reproduction'; END IF;
    END $$;
    DROP TRIGGER fixture_item_race_gate ON public.order_items;
    DROP FUNCTION public.fixture_item_race_gate();`);
  console.log('BLOCKER reproduced: concurrent item INSERT commits after initiation (READ COMMITTED stale parent snapshot).');
  // Inherited unsafe grants must cause atomic migration failure, not partial ACLs.
  psql('-c', 'CREATE ROLE fixture_unsafe_wallet NOLOGIN; GRANT UPDATE(wallet_balance) ON public.profiles TO fixture_unsafe_wallet; GRANT fixture_unsafe_wallet TO authenticated;');
  let preflightCases = 0;
  const expectRefusal = (label, message) => {
    let refused = false;
    try { psql('-f', 'supabase/migrations/20261017143036_first_security_containment.sql'); }
    catch (error) {
      if (!String(error.stderr).includes(message)) throw error;
      refused = true;
    }
    if (!refused) throw new Error(`Migration failed to reject ${label}`);
    psql('-c', "DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Containment unpaid gateway inserts') OR NOT has_column_privilege('authenticated','public.profiles','first_name','UPDATE') THEN RAISE EXCEPTION 'Failed migration was not atomic'; END IF; END $$;");
    console.log(`PASS: ${label} rejected atomically.`);
    preflightCases++;
  };
  expectRefusal('inherited authenticated wallet grant', 'retains financial privileges');
  psql('-c', 'REVOKE fixture_unsafe_wallet FROM authenticated; GRANT fixture_unsafe_wallet TO anon;');
  expectRefusal('inherited anonymous wallet grant', 'retains financial privileges');
  psql('-c', 'REVOKE fixture_unsafe_wallet FROM anon; CREATE ROLE fixture_unsafe_truncate NOLOGIN; GRANT TRUNCATE ON public.orders TO fixture_unsafe_truncate; GRANT fixture_unsafe_truncate TO authenticated;');
  expectRefusal('inherited TRUNCATE grant', 'retains TRUNCATE');
  psql('-c', 'REVOKE fixture_unsafe_truncate FROM authenticated; CREATE ROLE fixture_order_owner NOLOGIN; ALTER TABLE public.orders OWNER TO fixture_order_owner; GRANT fixture_order_owner TO authenticated;');
  expectRefusal('inherited order table ownership', 'owner-role membership');
  psql('-c', 'ALTER TABLE public.orders OWNER TO postgres; REVOKE fixture_order_owner FROM authenticated; CREATE ROLE fixture_bypass NOLOGIN BYPASSRLS; ALTER ROLE authenticated NOINHERIT; GRANT fixture_bypass TO authenticated;');
  expectRefusal('NOINHERIT membership in assumable bypass role', 'privileged-role membership');
  psql('-c', 'REVOKE fixture_bypass FROM authenticated; ALTER ROLE authenticated INHERIT; REVOKE EXECUTE ON FUNCTION public.has_role(uuid,public.app_role) FROM authenticated;');
  expectRefusal('missing enum has_role EXECUTE', 'function type or EXECUTE');
  psql('-c', 'GRANT EXECUTE ON FUNCTION public.has_role(uuid,public.app_role) TO authenticated; ALTER FUNCTION public.has_role(uuid,public.app_role) RENAME TO fixture_original_has_role;');
  expectRefusal('missing enum has_role signature despite text overload', 'prerequisite missing: public.has_role');
  psql('-c', 'ALTER FUNCTION public.fixture_original_has_role(uuid,public.app_role) RENAME TO has_role; DROP FUNCTION public.has_role(uuid,text); CREATE FUNCTION public.has_role(_user_id uuid,_role text) RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT false $$;');
  expectRefusal('ambiguous named PostgREST role overload', 'ambiguous PostgREST');
  psql('-c', 'DROP FUNCTION public.has_role(uuid,text); ALTER ROLE service_role NOBYPASSRLS;');
  expectRefusal('service role without legacy-settlement bypass', 'trusted service_role BYPASSRLS');
  psql('-c', 'ALTER ROLE service_role BYPASSRLS; ALTER TABLE public.wallet_topups RENAME TO fixture_missing_topups;');
  expectRefusal('missing prerequisite wallet_topups table', 'prerequisite missing: public.wallet_topups');
  psql('-c', 'ALTER TABLE public.fixture_missing_topups RENAME TO wallet_topups;');

  // Exercise the other email branch without rerunning forward DDL on the same
  // schema: a second fresh database in this run's isolated cluster.
  psql('-c', 'CREATE DATABASE fixture_existing_email;');
  testDatabase = 'fixture_existing_email';
  prepareDatabase();
  psql('-c', "ALTER TABLE public.profiles ADD COLUMN email text; UPDATE public.profiles SET email='existing@example.invalid' WHERE id='10000000-0000-0000-0000-000000000001';");
  psql('-f', 'supabase/migrations/20261017143036_first_security_containment.sql');
  psql('-c', "DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM public.profiles WHERE id='10000000-0000-0000-0000-000000000001' AND email='existing@example.invalid' AND wallet_balance=5000) THEN RAISE EXCEPTION 'Existing profile data changed'; END IF; END $$;");
  console.log('PASS: pre-existing contact email and financial data preserved.');
  psql('-c', 'ALTER TABLE public.profiles ALTER COLUMN email TYPE jsonb USING to_jsonb(email);');
  expectRefusal('incompatible existing contact email type', 'contact email must be nullable writable text');
  console.log(`Migration refusal/rollback scenarios: ${preflightCases} passed.`);
  console.log('Database checks complete on a disposable PostgreSQL cluster (not Supabase HTTP/Auth).');
} catch (error) {
  failed = true;
  const log = join(directory, 'postgres.log');
  if (existsSync(log)) process.stderr.write(readFileSync(log, 'utf8'));
  if (error.stdout) process.stdout.write(String(error.stdout));
  if (error.stderr) process.stderr.write(String(error.stderr));
  throw error;
} finally {
  let safeToRemove = true;
  try {
    if (started || existsSync(join(data, 'postmaster.pid'))) run('pg_ctl', ['-D', data, '-m', 'fast', '-w', 'stop']);
  } catch (error) {
    safeToRemove = false;
    if (!failed) throw error;
    console.error('Test cluster shutdown failed; preserving temporary data and original failure.');
  }
  // Delete only this run's verified mkdtemp directory, after stopping its server.
  const expectedParent = resolve(tmpdir());
  if (dirname(resolve(directory)) !== expectedParent || !directory.startsWith(join(expectedParent, 'jami-containment-'))) {
    throw new Error('Refusing cleanup outside the test temporary directory');
  }
  if (safeToRemove) rmSync(directory, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
}
