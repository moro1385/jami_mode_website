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
    '20260817122100_add_product_details.sql',
    '20260817122200_add_product_colors.sql',
    '20260921000000_add_out_of_stock.sql',
  ];
  const prepareDatabase = () => {
    psql('-f', 'supabase/tests/fixtures/auth.sql');
    for (const file of baseline) psql('-f', `supabase/migrations/${file}`);
    psql('-f', 'supabase/tests/fixtures/containment-before.sql');
  };
  prepareDatabase();
  psql('-f', 'supabase/migrations/20261017143036_first_security_containment.sql');
  psql('-f', 'supabase/migrations/20261017180000_trusted_checkout.sql');
  process.stdout.write(psql('-f', 'supabase/tests/trusted_checkout.sql'));
  const interactive = () => {
    const child = spawn(binary('psql'), ['-X', '-A', '-t', '-w', '-h', '127.0.0.1', '-p', String(port), '-U', 'postgres', '-d', testDatabase, '-v', 'ON_ERROR_STOP=1'], { cwd: root, env, windowsHide: true, stdio: 'pipe' });
    let output = '';
    const listeners = [];
    const timer = setTimeout(() => child.kill(), 15000);
    for (const stream of [child.stdout, child.stderr]) stream.on('data', data => { output += data; for (const listener of listeners) listener(); });
    const done = new Promise((resolve, reject) => {
      child.on('error', reject);
      // ON_ERROR_STOP may close a deliberately rejected contender before its
      // final COMMIT is written. Preserve SQL exit/output as the test result.
      child.stdin.on('error', error => { if (error.code !== 'EPIPE') reject(error); });
      child.on('close', code => { clearTimeout(timer); code === 0 ? resolve(output) : reject(new Error(`Race session failed (${code}): ${output}`)); });
    });
    const until = marker => Promise.race([new Promise(resolve => {
      const check = () => { if (output.includes(marker)) resolve(); };
      listeners.push(check); check();
    }), done.then(() => { throw new Error(`Race session ended before ${marker}`); })]);
    return { child, until, done };
  };
  const { runRaces } = await import('./trusted-checkout-races.mjs');
  await runRaces({ psql, interactive });
  psql('-f', 'supabase/tests/fixtures/storage.sql');
  psql('-f', 'supabase/migrations/20260911000000_create_return_requests.sql');
  psql('-f', 'supabase/migrations/20261019075415_phase0_payment_recovery.sql');
  psql('-f', 'supabase/migrations/20261019075416_phase0_private_return_images.sql');
  psql('-f', 'supabase/migrations/20261019075417_phase0_reservation_expiry.sql');
  psql('-f', 'supabase/migrations/20261019142741_phase0_maintenance_operations.sql');
  process.stdout.write(psql('-f', 'supabase/tests/phase0-followup.sql'));
  const { runPhase0Races } = await import('./phase0-races.mjs');
  await runPhase0Races({ psql, interactive });
  process.stdout.write(psql('-f', 'supabase/tests/maintenance_operations.sql'));
  const maintainer = interactive();
  try {
    maintainer.child.stdin.write("BEGIN; SELECT pg_advisory_xact_lock(hashtextextended('jamimode-phase0-maintenance',0));\n\\echo MAINTENANCE_LOCKED\n");
    await maintainer.until('MAINTENANCE_LOCKED');
    const before = psql('-c', 'SELECT count(*) FROM checkout_private.maintenance_runs').trim();
    const skipped = JSON.parse(psql('-c', 'SET ROLE service_role; SELECT public.trusted_maintenance_run(50,0)').trim().split('\n').at(-1));
    if (skipped.skipped !== true || psql('-c', 'SELECT count(*) FROM checkout_private.maintenance_runs').trim() !== before) throw Error('Concurrent maintenance was not skipped');
    maintainer.child.stdin.end('ROLLBACK;'); await maintainer.done;
  } finally { maintainer.child.kill(); }
  console.log('PASS: overlapping maintenance skips without mutation or duplicate run log.');
  psql('-f', 'supabase/migrations/20261022072115_phase1_payment_review.sql');
  process.stdout.write(psql('-f', 'ops/validate-payment-review.sql'));
  process.stdout.write(psql('-f', 'supabase/tests/payment_review.sql'));
  const { runPaymentReviewRaces } = await import('./payment-review-races.mjs');
  await runPaymentReviewRaces({ psql, interactive });
  psql('-f', 'supabase/migrations/20261022085357_phase1_wallet_ledger.sql');
  process.stdout.write(psql('-f', 'ops/validate-wallet-ledger.sql'));
  process.stdout.write(psql('-f', 'supabase/tests/wallet_ledger.sql'));
  const { runWalletLedgerRaces } = await import('./wallet-ledger-races.mjs');
  await runWalletLedgerRaces({ psql, interactive });
  psql('-f', 'supabase/migrations/20261022205522_phase1_wallet_topups.sql');
  process.stdout.write(psql('-f', 'ops/validate-wallet-topups.sql'));
  process.stdout.write(psql('-f', 'supabase/tests/wallet_topups.sql'));
  const { runWalletTopupRaces } = await import('./wallet-topup-races.mjs');
  await runWalletTopupRaces({ psql, interactive });
  psql('-f', 'supabase/migrations/20261022211146_phase1_wallet_interface.sql');
  process.stdout.write(psql('-f', 'supabase/tests/wallet_view.sql'));
  psql('-f', 'supabase/migrations/20261022213205_phase1_wallet_readiness.sql');
  process.stdout.write(psql('-f', 'supabase/tests/payment_review.sql'));
  process.stdout.write(psql('-f', 'supabase/tests/wallet_readiness.sql'));
  const { runWalletReadyRaces } = await import('./wallet-ready-races.mjs');
  await runWalletReadyRaces({ psql, interactive });
  process.stdout.write(psql('-f', 'ops/validate-wallet-readiness.sql'));
  const { runWalletHttpAcceptance } = await import('./wallet-http-acceptance.mjs');
  await runWalletHttpAcceptance({ psql });
  psql('-f', 'supabase/migrations/20261023222824_phase5_inventory_adjustments.sql');
  const { runInventoryAdjustmentTests } = await import('./inventory-adjustment-db-tests.mjs');
  psql('-f', 'supabase/migrations/20261024143147_phase5_inventory_write_boundary.sql');
  const { runInventoryBoundaryTests } = await import('./inventory-boundary-db-tests.mjs');
  await runInventoryBoundaryTests({ psql });
  await runInventoryAdjustmentTests({ psql, interactive });
  psql('-f','supabase/migrations/20261024191318_phase5_inventory_balance_report.sql');
  const {runInventoryBalanceTests} = await import('./inventory-balance-db-tests.mjs');
  await runInventoryBalanceTests({psql,interactive});
  psql('-f','supabase/migrations/20261024193126_phase5_inventory_low_stock_policy.sql');
  const {runInventoryPolicyTests}=await import('./inventory-policy-db-tests.mjs');
  await runInventoryPolicyTests({psql,interactive});
  psql('-f','supabase/migrations/20261024194520_phase5_inventory_alert_queue.sql');
  const {runInventoryAlertTests}=await import('./inventory-alert-db-tests.mjs');
  await runInventoryAlertTests({psql});
  psql('-f','supabase/migrations/20261024200926_phase5_inventory_alert_followup.sql');
  const {runInventoryFollowupTests}=await import('./inventory-followup-db-tests.mjs');
  await runInventoryFollowupTests({psql,interactive});
  psql('-f','supabase/migrations/20261024211002_phase5_inventory_followup_queue.sql');
  const {runInventoryFollowupQueueTests}=await import('./inventory-followup-queue-db-tests.mjs');
  await runInventoryFollowupQueueTests({psql});
  psql('-f','supabase/migrations/20261024212044_phase5_inventory_alert_assignments.sql');
  const {runInventoryAssignmentTests}=await import('./inventory-assignment-db-tests.mjs');
  await runInventoryAssignmentTests({psql,interactive});
  psql('-f','supabase/migrations/20261025123628_phase5_inventory_assignment_queue.sql');
  const {runInventoryAssignmentQueueTests}=await import('./inventory-assignment-queue-db-tests.mjs');
  await runInventoryAssignmentQueueTests({psql});
  // This incremental containment harness does not replay every historical support table.
  // The full bootstrap runner already includes these migrations in chronological order.
  psql('-f','supabase/migrations/20260903000000_create_tickets_table.sql');
  psql('-f','supabase/migrations/20260912000000_create_user_messages_table.sql');
  psql('-f','supabase/migrations/20261025125109_phase5_erp_operations.sql');
  const {runErpTests}=await import('./erp-db-tests.mjs');
  await runErpTests({psql,interactive});
  console.log('Phase 0 follow-up database assertions passed (local disposable PostgreSQL; synthetic Auth/Storage).');
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
  if (safeToRemove) { rmSync(directory, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 }); console.log('DISPOSABLE_DB_CLEANUP stopped and removed own temporary cluster'); }
}
