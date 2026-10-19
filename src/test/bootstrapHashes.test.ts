// @vitest-environment node
import { afterEach, describe, expect, it } from 'vitest';
import { cpSync, mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { validateBootstrap } from '../../scripts/check-test-bootstrap.mjs';
const dirs: string[] = [];
afterEach(() => { for (const dir of dirs.splice(0)) { if (dirname(resolve(dir)) !== resolve(tmpdir()) || !dir.startsWith(join(tmpdir(),'jami-hash-test-'))) throw new Error('Unsafe cleanup'); rmSync(dir,{recursive:true,force:true}); } });
describe('portable SQL integrity checks', () => {
 it('accepts CRLF/LF changes but rejects content tampering', () => {
  const dir = mkdtempSync(join(tmpdir(),'jami-hash-test-')); dirs.push(dir);
  cpSync('supabase/migrations',join(dir,'supabase/migrations'),{recursive:true});
  cpSync('supabase/test-bootstrap',join(dir,'supabase/test-bootstrap'),{recursive:true});
  const name = validateBootstrap(dir).migrations[0].filename;
  for (const file of [join(dir,'supabase/migrations',name),join(dir,'supabase/test-bootstrap/migrations',name)]) {
   writeFileSync(file,readFileSync(file,'utf8').replace(/\r?\n/g,'\r\n'));
  }
  expect(()=>validateBootstrap(dir)).not.toThrow();
  const path=join(dir,'supabase/migrations',name); writeFileSync(path,readFileSync(path,'utf8')+'-- actual content change');
  expect(()=>validateBootstrap(dir)).toThrow('drift');
 });
});
