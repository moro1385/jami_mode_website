import { useCallback, useEffect, useRef } from 'react';
// Capture a lifetime before awaiting. A -> B -> A never revives work started in the first A.
export function useRequestScope(key: string | undefined) {
  const scope = useRef({ key });
  if (scope.current.key !== key) scope.current = { key };
  const lifetime = useRef({ active: true });
  useEffect(() => {
    const token = { active: true }; lifetime.current = token;
    return () => { token.active = false; };
  }, []);
  const renderedScope = scope.current;
  return useCallback(() => {
    const capturedScope = renderedScope, capturedLifetime = lifetime.current;
    return () => capturedScope.key !== undefined && capturedLifetime.active && lifetime.current === capturedLifetime && scope.current === capturedScope;
  }, [renderedScope]);
}
