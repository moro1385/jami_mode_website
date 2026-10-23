import { useCallback, useEffect, useState } from 'react';

// Scope is compared during render as well as in effect cleanup, hiding old-owner rows immediately.
export function useScopedAsyncRead<T>(scope: string | undefined, load: () => Promise<T>) {
  const [attempt, setAttempt] = useState(0);
  const retry = useCallback(() => setAttempt(value => value + 1), []);
  const [state, setState] = useState<{ scope?: string; value?: T; loading: boolean; error?: unknown }>({ loading: !!scope });
  useEffect(() => {
    let active = true;
    setState({ scope, loading: !!scope });
    if (scope) void load().then(
      value => { if (active) setState({ scope, value, loading: false }); },
      error => { if (active) { console.error('Failed to load data:', error); setState({ scope, loading: false, error }); } },
    );
    return () => { active = false; };
  }, [scope, load, attempt]);
  return { ...(state.scope === scope ? state : { loading: !!scope, value: undefined, error: undefined }), retry };
}
