import { readFileSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
export function validateBootstrap(root = process.cwd()) {
  const dir = resolve(root, 'supabase/test-bootstrap');
  const manifest = JSON.parse(readFileSync(resolve(dir, 'manifest.json'), 'utf8'));
  const source = readdirSync(resolve(root, 'supabase/migrations')).filter(file => file.endsWith('.sql')).sort();
  const listed = manifest.migrations.map(entry => entry.filename);
  if (manifest.projectRef !== 'cifhcrlmjnsxpkhyloen' || source.length !== 22 || listed.length !== 22
    || new Set(listed).size !== 22 || source.join() !== [...listed].sort().join()) throw new Error('Migration coverage mismatch');
  const hash = bytes => createHash('sha256').update(bytes).digest('hex');
  for (const [i, entry] of manifest.migrations.entries()) {
    const original = readFileSync(resolve(root, 'supabase/migrations', entry.filename));
    const copy = readFileSync(resolve(dir, 'migrations', entry.filename));
    if (entry.order !== i + 1 || hash(original) !== entry.sourceSha256 || hash(copy) !== entry.bootstrapSha256) {
      throw new Error('Bootstrap/source drift; review manifest before proceeding');
    }
    const expected = entry.filename === '20240101000001_fix_profiles_rls.sql'
      ? original.toString().replace("public.has_role('admin'::app_role, auth.uid())", "public.has_role(auth.uid(), 'admin'::public.app_role)")
      : original.toString();
    if (copy.toString() !== expected) throw new Error('Unexpected bootstrap correction');
  }
  const baseline = listed.findIndex(file => file.startsWith('20260817121647'));
  if (baseline !== 0) throw new Error('Baseline must precede ALTER/policy migrations');
  const before = (a, b) => {
    if (listed.findIndex(file => file.startsWith(a)) >= listed.findIndex(file => file.startsWith(b))) throw new Error('Migration dependency violated');
  };
  for (const [a,b] of [['20260817122100','20260817122200'], ['20260817122100','20260904000000'],
    ['20260901000000','20260902000000'], ['20260921122000','20261017143036'],
    ['20260922000000','20261017143036'], ['20261017143036','20261017180000'],
    ['20260817122200','20261017180000'], ['20260921000000','20261017180000']]) before(a,b);
  for (const entry of [manifest.preflight, manifest.postMigrationFixes]) {
    if (hash(readFileSync(resolve(dir, entry.filename))) !== entry.sha256) throw new Error('Bootstrap fix/preflight drift');
  }
  const script = readFileSync(resolve(dir, 'bootstrap.psql'), 'utf8');
  if (!script.includes('\\set ON_ERROR_STOP on') || !script.includes('\\ir preflight.sql') || !script.includes('\\ir fixes.sql')) throw new Error('Bootstrap guards missing');
  const includes = [...readFileSync(resolve(dir, 'bootstrap.psql'), 'utf8').matchAll(/^\\ir migrations\/(.+)$/gm)].map(match => match[1]);
  if (includes.join() !== listed.join()) throw new Error('Executable manifest order differs');
  return manifest;
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  validateBootstrap(); console.log('All 22 bootstrap copies, hashes, dependencies and execution order verified.');
}
