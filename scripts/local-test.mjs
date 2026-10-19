// No root .env, linked-project metadata, sitemap or real provider is used.
import { readFileSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { resolve, relative, isAbsolute } from 'node:path';
import { parse } from 'dotenv';
import { testBackendConfig } from '../server/test-harness/config.js';
const command = process.argv[2];
if (!['frontend', 'backend', 'build', 'seed'].includes(command) || process.argv.length !== 4) {
  throw new Error('Usage: node scripts/local-test.mjs <frontend|backend|build|seed> <dedicated.env.local>');
}
const envFile = resolve(process.argv[3]);
const relativeFile = relative(process.cwd(), envFile);
if (!relativeFile.startsWith('..') && !isAbsolute(relativeFile)) {
  throw new Error('Keep the server credential file outside the web workspace');
}
const config = parse(readFileSync(envFile));
// Reject accidental inherited payment credentials as well as file credentials.
const checked = testBackendConfig({ ...process.env, ...config });
const allowedKeys = ['JAMI_TEST_SUPABASE_URL', 'JAMI_TEST_SUPABASE_PUBLISHABLE_KEY',
 'JAMI_TEST_SUPABASE_SECRET_KEY', 'JAMI_TEST_SEED_PASSWORD'];
if (Object.keys(config).some(key => !allowedKeys.includes(key))) throw new Error('Unexpected test environment variable');
const system = ['PATH', 'SYSTEMROOT', 'COMSPEC', 'TEMP', 'TMP', 'PATHEXT', 'APPDATA', 'LOCALAPPDATA', 'USERPROFILE'];
const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => system.includes(key.toUpperCase())));
let args;
if (command === 'frontend' || command === 'build') {
  // Only these two public values reach Vite, even if the source file has a secret.
  env.VITE_SUPABASE_URL = checked.url;
  env.VITE_SUPABASE_PUBLISHABLE_KEY = checked.publishable;
  args = ['node_modules/vite/bin/vite.js', ...(command === 'build' ? ['build', '--outDir', 'dist-local-test'] : []), '--mode', 'local-test'];
} else {
  Object.assign(env, Object.fromEntries(allowedKeys.filter(key => config[key]).map(key => [key, config[key]])));
  args = [command === 'backend' ? 'server/test-harness/start.js' : 'scripts/seed-local-test.mjs'];
}
const child = spawn(process.execPath, args, { cwd: process.cwd(), env, windowsHide: true, stdio: 'inherit' });
child.on('error', () => { console.error('Local test process could not start'); process.exitCode = 1; });
child.on('exit', code => { process.exitCode = code ?? 1; });
