import type { CartSharedLocks, CartSnapshotStorage } from '../application/cartCoordinator';
import { CartSyncError, snapshotFromRaw } from '../domain/cartSnapshot';
export function createBrowserCartSnapshots(storage: Pick<Storage, 'getItem' | 'setItem'>, namespace: string) {
 const snapshotKey = (owner: string) => namespace + ':cart-v1:' + encodeURIComponent(owner);
 const ackKey = (owner: string) => snapshotKey(owner) + ':ack';
 const snapshots: CartSnapshotStorage = {
  read: owner => snapshotFromRaw(storage.getItem(snapshotKey(owner)), owner),
  write: snapshot => storage.setItem(snapshotKey(snapshot.ownerId), JSON.stringify(snapshot)),
  acknowledged: owner => storage.getItem(ackKey(owner)),
  acknowledge: (owner, revision) => storage.setItem(ackKey(owner), revision),
 };
 return { snapshots, matches: (owner: string, key: string | null) => key === snapshotKey(owner) || key === ackKey(owner) };
}
export function createBrowserCartLocks(namespace: string, manager?: Pick<LockManager, 'request'>): CartSharedLocks {
 return { async withLock<T>(key: string, work: () => Promise<T> | T): Promise<T> {
  if (!manager) throw new CartSyncError('UNAVAILABLE');
  // A bounded queued wait does not release an acquired lock; the HTTP adapter has its own deadline.
  const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 15_000);
  try { return await manager.request(namespace + ':cart-v1:' + key, { mode: 'exclusive', signal: controller.signal }, () => work()); }
  finally { clearTimeout(timer); }
 } };
}
