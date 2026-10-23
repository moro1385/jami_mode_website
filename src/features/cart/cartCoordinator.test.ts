import { describe, expect, it, vi } from 'vitest';
import { createCartCoordinator, type CartSharedLocks } from './application/cartCoordinator';
import { createBrowserCartSnapshots, createBrowserCartLocks } from './infrastructure/browserCartSnapshots';
import { snapshotFromRaw } from './domain/cartSnapshot';
import type { CartItem } from './domain/cart';
const item: CartItem = { id: 'p', productId: 'p', productTitle: 'Fixture', productHandle: 'fixture', image: '', quantity: 1, price: { amount: '7000', currencyCode: 'IRR' }, selectedSize: null, selectedColor: null };
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(r => { resolve = r; }); return { promise, resolve }; }
function setup() {
 const values = new Map<string, string>(), pending = new Map<string, Promise<void>>(); let revision = 0, owner = 'A';
 const locks: CartSharedLocks = { withLock<T>(key: string, work: () => Promise<T> | T): Promise<T> {
  const result = (pending.get(key) ?? Promise.resolve()).then(work), tail = result.then(() => {}, () => {}); pending.set(key, tail); return result;
 } };
 const browser = createBrowserCartSnapshots({ getItem: key => values.get(key) ?? null, setItem: (key, value) => { values.set(key, value); } }, 'synthetic');
 const remote = { load: vi.fn().mockResolvedValue([item]), save: vi.fn().mockResolvedValue(undefined) };
 const make = () => createCartCoordinator({ remote, storage: browser.snapshots, locks, currentOwner: async () => owner, revision: () => 'revision-' + (++revision) });
 return { a: make(), b: make(), remote, values, browser, locks, setOwner: (id: string) => { owner = id; } };
}
describe('same-browser owner cart coordination', () => {
 it('copies local edits before waiting and does not create new revisions for identical snapshots', async () => {
  const s = setup(), editing = [{ ...item, price: { ...item.price } }];
  const staged = s.a.stage('A', editing); editing[0].quantity = 99; editing[0].price.amount = 'changed';
  const snapshot = await staged; expect(snapshot.items[0]).toMatchObject({ quantity: 1, price: { amount: '7000' } });
  expect((await s.a.stage('A', [item])).revision).toBe(snapshot.revision);
 });
 it('serializes writes across instances and never acknowledges over a newer pending edit', async () => {
  const s = setup(), gate = deferred<void>(); let inFlight = 0, maximum = 0;
  s.remote.save.mockImplementationOnce(async () => { maximum = Math.max(maximum, ++inFlight); await gate.promise; inFlight--; }).mockImplementationOnce(async () => { maximum = Math.max(maximum, ++inFlight); inFlight--; });
  await s.a.stage('A', [item]); const first = s.a.commit('A');
  await vi.waitFor(() => expect(s.remote.save).toHaveBeenCalledTimes(1));
  await s.b.stage('A', [{ ...item, quantity: 3 }]); const second = s.b.commit('A');
  await Promise.resolve(); expect(s.remote.save).toHaveBeenCalledTimes(1);
  gate.resolve(); await first;
  // Even if B is already dispatched, its snapshot cannot have been erased by A's ack.
  expect(s.a.peek('A')?.items[0].quantity).toBe(3); await second;
  expect(s.remote.save.mock.calls.map(call => call[1][0].quantity)).toEqual([1, 3]); expect(maximum).toBe(1); expect(s.a.peek('A')?.pending).toBe(false);
 });
 it('a later queued write uses the latest shared snapshot rather than an old tab copy', async () => {
  const s = setup(), gate = deferred<void>(); s.remote.save.mockImplementationOnce(() => gate.promise);
  await s.a.stage('A', [item]); const old = s.a.commit('A'); await vi.waitFor(() => expect(s.remote.save).toHaveBeenCalledTimes(1));
  const queued = s.a.commit('A'); await s.b.stage('A', [{ ...item, quantity: 4 }]); gate.resolve(); await Promise.all([old, queued]);
  expect(s.remote.save.mock.calls.map(call => call[1][0].quantity)).toEqual([1, 4]);
 });
 it('retains an empty pending cart over nonempty server/guest data after reconnect', async () => {
  const s = setup(); await s.a.stage('A', []);
  expect((await s.b.load('A', [item])).items).toEqual([]); expect(s.b.peek('A')?.pending).toBe(true);
  await s.b.commit('A'); expect(s.remote.save).toHaveBeenCalledWith('A', []); expect(s.b.peek('A')?.pending).toBe(false);
 });
 it('keeps an unknown remote cart untouched after a denied read', async () => {
  const s = setup(); s.remote.load.mockRejectedValue(Error('denied'));
  await expect(s.a.load('A', [item])).rejects.toThrow('denied'); expect(s.a.peek('A')).toBeNull(); expect(s.remote.save).not.toHaveBeenCalled();
 });
 it('keeps failed writes pending and sends the newest edit on an explicit retry', async () => {
  const s = setup(); s.remote.save.mockRejectedValueOnce(Error('offline'));
  await s.a.stage('A', [item]); await expect(s.a.commit('A')).rejects.toThrow('offline'); expect(s.a.peek('A')?.pending).toBe(true);
  expect(s.remote.save).toHaveBeenCalledTimes(1); await s.b.stage('A', [{ ...item, quantity: 5 }]); await s.a.commit('A');
  expect(s.remote.save.mock.calls[1][1][0].quantity).toBe(5); expect(s.a.peek('A')?.pending).toBe(false);
 });
 it('checks fresh identity and the owner lifetime after a queued lock is granted', async () => {
  const s = setup(), gate = deferred<void>(); await s.a.stage('A', [item]);
  const held = s.locks.withLock('network:A', () => gate.promise); let current = true;
  const pending = s.a.commit('A', () => current); const rejected = expect(pending).rejects.toMatchObject({ code: 'STALE_OWNER' }); current = false; gate.resolve(); await held; await rejected;
  s.setOwner('B'); await expect(s.a.commit('A')).rejects.toMatchObject({ code: 'STALE_OWNER' }); expect(s.remote.save).not.toHaveBeenCalled();
 });
 it('isolates snapshots and acknowledgements by owner and rejects a closed staged edit', async () => {
  const s = setup(); await s.a.stage('A', [item]); expect(s.a.peek('B')).toBeNull();
  await expect(s.a.stage('A', [], () => false)).rejects.toMatchObject({ code: 'STALE_OWNER' }); expect(s.a.peek('A')?.items).toEqual([item]);
  expect(s.browser.matches('A', 'synthetic:cart-v1:B')).toBe(false);
 });
 it('does not upload clean server snapshots and does not preserve a stale owned seed', async () => {
  const s = setup(); await s.a.load('A', []); await s.a.commit('A'); expect(s.remote.save).not.toHaveBeenCalled();
  s.remote.load.mockResolvedValueOnce([]); expect((await s.a.load('A', [])).items).toEqual([]); expect(s.a.peek('A')?.pending).toBe(false);
 });
 it('preserves a guest seed as pending only when the authenticated server cart is empty', async () => {
  const s = setup(); s.remote.load.mockResolvedValue([]); expect((await s.a.load('A', [item])).items).toEqual([item]); expect(s.a.peek('A')?.pending).toBe(true);
 });
});
describe('browser persistence boundary', () => {
 it.each(['broken', JSON.stringify({ version: 1, ownerId: 'B', revision: 'r', items: [] }), JSON.stringify({ version: 1, ownerId: 'A', revision: 'r', items: [{ ...item, quantity: 999 }] })])('rejects corrupt or foreign persisted snapshots', raw => {
  expect(() => snapshotFromRaw(raw, 'A')).toThrow('INVALID_SNAPSHOT');
 });
 it('fails closed when cross-tab locks are unavailable instead of silently writing concurrently', async () => {
  const work = vi.fn(); await expect(createBrowserCartLocks('synthetic').withLock('network:A', work)).rejects.toMatchObject({ code: 'UNAVAILABLE' }); expect(work).not.toHaveBeenCalled();
 });
 it('does not hide storage quota/access failures or erase the previous record', async () => {
  const s = setup(); await s.a.stage('A', [item]); const before = s.a.peek('A');
  const broken = createBrowserCartSnapshots({ getItem: () => JSON.stringify(before), setItem: () => { throw Error('quota'); } }, 'synthetic');
  expect(() => broken.snapshots.write({ version: 1, ownerId: 'A', revision: 'new', items: [] })).toThrow('quota'); expect(s.a.peek('A')).toEqual(before);
 });
});
