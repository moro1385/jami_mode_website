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
  // Disposable test cluster only: skip initdb's initial disk sync, not server/WAL fsync.
  run('initdb', ['-D', data, '-U', 'postgres', '-A', 'trust', '--encoding=UTF8', '--no-locale', '--no-sync']);
  // TCP only: distro defaults may point Unix sockets at /var/run/postgresql,
  // which an unprivileged CI runner cannot write. Clients already pin loopback.
  run('pg_ctl', ['-D', data, '-l', join(directory, 'postgres.log'), '-o', `-h 127.0.0.1 -p ${port} -c unix_socket_directories=`, '-w', 'start']);
  started = true;
  let testDatabase = 'postgres';
  const psql = (...args) => run('psql', ['-X', '-A', '-t', '-w', '-h', '127.0.0.1', '-p', String(port), '-U', 'postgres', '-d', testDatabase, '-v', 'ON_ERROR_STOP=1', ...args]);
  // Fresh synthetic platform, all 22 copied migrations, then scoped fixes.
  psql('-f', 'supabase/test-bootstrap/validation/platform.sql');
  psql('-v', 'target_project=cifhcrlmjnsxpkhyloen', '-f', 'supabase/test-bootstrap/bootstrap.psql');
  // Validate the exact hosted acceptance SQL first, against an empty disposable baseline.
  psql('-c', "INSERT INTO auth.users(id,phone) VALUES('10000000-0000-0000-0000-000000000999','+12025550101')" );
  process.stdout.write(psql('-f', 'ops/test-phase0-maintenance.sql'));
  psql('-c', "DELETE FROM auth.users WHERE id='10000000-0000-0000-0000-000000000999'" );
  process.stdout.write(psql('-f', 'ops/validate-wallet-topups.sql'));
  process.stdout.write(psql('-f', 'supabase/test-bootstrap/validation/assertions.sql'));
  process.stdout.write(psql('-f', 'supabase/tests/log_retention.sql'));
  process.stdout.write(psql('-f', 'supabase/tests/wallet_view.sql'));
  process.stdout.write(psql('-f', 'supabase/tests/wallet_readiness.sql'));
  process.stdout.write(psql('-f', 'ops/validate-wallet-readiness.sql'));
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
