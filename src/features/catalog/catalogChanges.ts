const listeners = new Set<() => void>();
export const catalogChanges = {
  subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
  publish() { for (const listener of listeners) try { listener(); } catch (error) { console.error('Catalog cache observer failed:', error); } },
};
export function afterCatalogMutation<Args extends unknown[], Result>(operation: (...args: Args) => Promise<Result>) {
  return async (...args: Args): Promise<Result> => {
    const result = await operation(...args);
    catalogChanges.publish();
    return result;
  };
}
