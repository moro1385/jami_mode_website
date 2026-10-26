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
  psql('-f','supabase/test-bootstrap/validation/platform.sql');
  psql('-v','target_project=cifhcrlmjnsxpkhyloen','-f','supabase/test-bootstrap/bootstrap.psql');
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
  const {runErpTests}=await import('./erp-db-tests.mjs');
  await runErpTests({psql,interactive});
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
