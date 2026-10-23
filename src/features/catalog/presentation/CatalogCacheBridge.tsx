import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { catalogChanges } from '../catalogChanges';
import { catalogQueryRoots } from './queryKeys';
export function CatalogCacheBridge() {
  const client = useQueryClient();
  useEffect(() => {
    let active = true, queued = false;
    const unsubscribe = catalogChanges.subscribe(() => {
      if (queued) return;
      queued = true;
      queueMicrotask(() => {
        queued = false;
        if (active) void client.invalidateQueries({ predicate: query => catalogQueryRoots.has(String(query.queryKey[0])) }).catch(error => console.error('Catalog invalidation failed:', error));
      });
    });
    return () => { active = false; unsubscribe(); };
  }, [client]);
  return null;
}
