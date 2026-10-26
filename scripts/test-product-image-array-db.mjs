// Disposable loopback-only cluster, no .env, linked Supabase project or inherited libpq credentials.
import { execFileSync } from 'node:child_process';
import { mkdtempSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, basename, sep, dirname } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { createServer } from 'node:net';
const repo = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const { postgresImageArray } = await import(pathToFileURL(join(repo, 'src/features/catalog/infrastructure/postgresImageArray.ts')).href);
const directory = mkdtempSync(join(tmpdir(), 'jami-image-array-test-')), data = join(directory, 'data');
const binary = name => process.env.JAMI_TEST_PG_BIN ? join(process.env.JAMI_TEST_PG_BIN, name + (process.platform === 'win32' ? '.exe' : '')) : name;
const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.toUpperCase().startsWith('PG')));
env.PGPASSFILE = join(directory, 'no-password-file'); env.PGSERVICEFILE = join(directory, 'no-service-file'); env.PGSYSCONFDIR = directory;
const run = (name, args, input) => execFileSync(binary(name), args, { cwd: directory, env, windowsHide: true, encoding: 'utf8', timeout: 45000, stdio: name === 'pg_ctl' ? 'ignore' : 'pipe', ...(input ? { input } : {}) });
const listener = createServer(); await new Promise((yes, no) => { listener.once('error', no); listener.listen(0, '127.0.0.1', yes); }); const port = listener.address().port; await new Promise(yes => listener.close(yes));
const report = { checkedAt: new Date().toISOString(), productionAccess: false, loopbackOnly: true, assertions: 0, passed: false };
try {
 run('initdb', ['-D', data, '-U', 'postgres', '-A', 'trust', '--encoding=UTF8', '--no-locale']);
 run('pg_ctl', ['-D', data, '-l', join(directory, 'postgres.log'), '-o', `-h 127.0.0.1 -p ${port} -c unix_socket_directories=`, '-w', 'start']);
 const psql = input => run('psql', ['-X', '-A', '-t', '-w', '-h', '127.0.0.1', '-p', String(port), '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-f', '-'], input).trim();
 const quote = value => "'" + value.replaceAll("'", "''") + "'";
 const sqlArray = values => 'ARRAY[' + values.map(quote).join(',') + ']::text[]';
 const cases = [['/a.jpg', '/b.jpg'], ['https://cdn.invalid/a,b{c}.jpg'], ['https://cdn.invalid/a"q.jpg'], [String.raw`https://cdn.invalid/a\back.jpg`], ['/عکس.svg?x=1&y=2'], ["https://cdn.invalid/it's.jpg"], ['/a.jpg', '/a.jpg', '/b.jpg'], []];
 let sql = 'SET standard_conforming_strings = on;\n';
 for (const values of cases) sql += `SELECT (${quote(postgresImageArray(values))}::text[] = ${sqlArray(values)})::int;\n`;
 const a = '/a.jpg', b = '/b.jpg', old = postgresImageArray([a, b]);
 sql += `CREATE TEMP TABLE image_fixture(id int PRIMARY KEY, images text[] NOT NULL);\nINSERT INTO image_fixture VALUES(1,${sqlArray([a,b])});\n`;
 sql += `WITH changed AS (UPDATE image_fixture SET images=${sqlArray([b,a])} WHERE id=1 AND images=${quote(old)}::text[] RETURNING id) SELECT (count(*)=1)::int FROM changed;\n`;
 sql += `WITH changed AS (UPDATE image_fixture SET images=${sqlArray([a])} WHERE id=1 AND images=${quote(old)}::text[] RETURNING id) SELECT (count(*)=0)::int FROM changed;\n`;
 sql += `SELECT (images=${sqlArray([b,a])})::int FROM image_fixture WHERE id=1;\nSELECT (${quote(old)}::text[] <> ${sqlArray([b,a])})::int;\n`;
 const outcomes = psql(sql).split(/\r?\n/).filter(line => /^[01]$/.test(line));
 if (outcomes.length !== cases.length + 4 || outcomes.some(value => value !== '1')) throw Error('Array roundtrip or exact-order update guard failed');
 report.assertions = outcomes.length; report.passed = true;
} catch (error) { report.error = error.message; process.exitCode = 1; }
finally {
 let stopped = !existsSync(join(data, 'postmaster.pid'));
 if (!stopped) { try { run('pg_ctl', ['-D', data, '-m', 'fast', '-w', 'stop']); stopped = true; } catch { report.cleanup = 'server stop requires review'; report.passed = false; process.exitCode = 1; } }
 const absolute = resolve(directory), temp = resolve(tmpdir());
 if (stopped && absolute.startsWith(temp + sep) && basename(absolute).startsWith('jami-image-array-test-')) { rmSync(absolute, { recursive: true, force: true }); report.cleanup = 'stopped and removed own temporary cluster'; }
 else if (stopped) { report.cleanup = 'temporary path verification failed'; report.passed = false; process.exitCode = 1; }
 console.log(JSON.stringify({ ...report, ...(report.error ? { error: 'Disposable database test failed' } : {}) }));
}
