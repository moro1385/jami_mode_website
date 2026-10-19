// Offline compile: synthetic public value + secret sentinel, no real credentials.
import { mkdtempSync, writeFileSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';
const directory = mkdtempSync(join(tmpdir(), 'jami-build-'));
try {
 const file = join(directory, 'offline.env.local');
 writeFileSync(file, 'JAMI_TEST_SUPABASE_URL=https://cifhcrlmjnsxpkhyloen.supabase.co\nJAMI_TEST_SUPABASE_PUBLISHABLE_KEY=sb_publishable_offline_build\nJAMI_TEST_SUPABASE_SECRET_KEY=sb_secret_OFFLINE_SENTINEL_NEVER_BUNDLE\n');
 execFileSync(process.execPath, ['scripts/local-test.mjs','build',file], { stdio: 'pipe', windowsHide: true });
 const html = readFileSync('dist-local-test/index.html','utf8');
 if (html.includes('klfmscuogsocfjxqkuib.supabase.co')) throw new Error('Production preconnect retained');
 const files = readdirSync('dist-local-test/assets').filter(name => name.endsWith('.js'));
 for (const name of files) {
  const source = readFileSync(join('dist-local-test/assets',name),'utf8');
  if (source.includes('OFFLINE_SENTINEL_NEVER_BUNDLE') || source.includes('JAMI_TEST_SUPABASE_SECRET_KEY')) throw new Error('Backend configuration leaked');
 }
 console.log('Local-test build passed; production preconnect removed; backend secret sentinel excluded.');
} finally {
 if (dirname(resolve(directory)) !== resolve(tmpdir()) || !directory.startsWith(join(resolve(tmpdir()), 'jami-build-'))) throw new Error('Unsafe cleanup path');
 rmSync(directory, { recursive: true, force: true });
}
