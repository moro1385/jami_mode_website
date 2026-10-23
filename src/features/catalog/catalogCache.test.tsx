import { afterEach, describe, it, expect, vi } from 'vitest';
import { act, cleanup, render, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { catalogChanges, afterCatalogMutation } from './catalogChanges';
import { CatalogCacheBridge } from './presentation/CatalogCacheBridge';
import { catalogReadRetry, catalogQueryKeys } from './presentation/queryKeys';
afterEach(cleanup);
describe('catalog cache ownership and refresh boundaries', () => {
  it('publishes only after successful persistence and preserves the operation result', async () => {
    const listener = vi.fn(); const stop = catalogChanges.subscribe(listener);
    const success = afterCatalogMutation(vi.fn().mockResolvedValue({ id: 'saved' }));
    expect(await success()).toEqual({ id: 'saved' }); expect(listener).toHaveBeenCalledTimes(1);
    await expect(afterCatalogMutation(vi.fn().mockRejectedValue(Error('denied')))()).rejects.toThrow('denied');
    expect(listener).toHaveBeenCalledTimes(1); stop();
  });
  it('invalidates list/detail catalog keys without touching private wallet state and cleans its listener', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const list = catalogQueryKeys.featured(8), detail = catalogQueryKeys.product('slug'), wallet = ['wallet', 'owner'];
    client.setQueryData(list, []); client.setQueryData(detail, {}); client.setQueryData(wallet, { balance: 10 });
    const rendered = render(<QueryClientProvider client={client}><CatalogCacheBridge /></QueryClientProvider>);
    act(() => catalogChanges.publish());
    await waitFor(() => expect(client.getQueryState(list)?.isInvalidated).toBe(true));
    expect(client.getQueryState(detail)?.isInvalidated).toBe(true);
    expect(client.getQueryState(wallet)?.isInvalidated).toBe(false);
    rendered.unmount(); client.setQueryData(list, []); catalogChanges.publish();
    await Promise.resolve(); expect(client.getQueryState(list)?.isInvalidated).toBe(false);
    client.clear();
  });
  it('does not automatically retry permissions or unbounded transient read failures', () => {
    expect(catalogReadRetry(0, { code: '42501' })).toBe(false);
    expect(catalogReadRetry(0, Error('offline'))).toBe(true);
    expect(catalogReadRetry(2, Error('offline'))).toBe(false);
  });
});
