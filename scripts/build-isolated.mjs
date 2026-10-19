// Bundle locally without root .env, inherited application credentials or the
// normal build script's live catalog sitemap request.
import { execFileSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const mode = process.argv[2] ?? 'production';
if (!['production', 'development'].includes(mode)) throw new Error('Unsupported build mode');
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const allowed = ['PATH', 'SYSTEMROOT', 'COMSPEC', 'TEMP', 'TMP', 'PATHEXT', 'APPDATA', 'LOCALAPPDATA', 'USERPROFILE'];
const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => allowed.includes(key.toUpperCase())));
env.VITE_SUPABASE_URL = 'https://cifhcrlmjnsxpkhyloen.supabase.co';
env.VITE_SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_offline_build_placeholder';
execFileSync(process.execPath, [resolve(root, 'node_modules/vite/bin/vite.js'), 'build', '--mode', mode, '--config', 'vitest.config.ts'], {
  cwd: root, env, windowsHide: true, stdio: 'inherit',
});
