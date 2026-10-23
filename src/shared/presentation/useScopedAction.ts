import { useRef, useState } from 'react';
import { useRequestScope } from './useRequestScope';
type Outcome<T> = { kind: 'success'; value: T } | { kind: 'failed'; error: unknown } | { kind: 'ignored' };
// UI coordination only: authorization and idempotency still belong to the backend.
export function useScopedAction(scopeKey: string | undefined) {
 const capture = useRequestScope(scopeKey);
 const scope = useRef({ key: scopeKey, locks: new Set<string>() });
 if (scope.current.key !== scopeKey) scope.current = { key: scopeKey, locks: new Set() };
 const [, redraw] = useState(0);
 async function run<T>(key: string, task: () => Promise<T>): Promise<Outcome<T>> {
  const current = capture(), captured = scope.current;
  if (!current() || captured.locks.has(key)) return { kind: 'ignored' };
  captured.locks.add(key); redraw(value => value + 1);
  try { const value = await task(); return current() ? { kind: 'success', value } : { kind: 'ignored' }; }
  catch (error) { return current() ? { kind: 'failed', error } : { kind: 'ignored' }; }
  finally { captured.locks.delete(key); if (current()) redraw(value => value + 1); }
 }
 return { run, pending: (key: string) => scope.current.locks.has(key) };
}
