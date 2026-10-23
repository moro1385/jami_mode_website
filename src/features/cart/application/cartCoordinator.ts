import { serializeCartItems, type CartItem } from '../domain/cart';
import { CartSyncError, newSnapshot, type CartSnapshot } from '../domain/cartSnapshot';
export interface CartSharedLocks { withLock<T>(key: string, work: () => Promise<T> | T): Promise<T> }
export interface CartSnapshotStorage {
 read(ownerId: string): CartSnapshot | null;
 write(snapshot: CartSnapshot): void;
 acknowledged(ownerId: string): string | null;
 acknowledge(ownerId: string, revision: string): void;
}
export function createCartCoordinator(ports: { remote: { load(ownerId: string): Promise<CartItem[]>; save(ownerId: string, items: CartItem[]): Promise<void> }; storage: CartSnapshotStorage; locks: CartSharedLocks; currentOwner(): Promise<string | null>; revision(): string }) {
 const assertCurrent = (current: () => boolean) => { if (!current()) throw new CartSyncError('STALE_OWNER'); };
 const snapshotLock = <T,>(owner: string, work: () => T) => ports.locks.withLock('snapshot:' + owner, work);
 const peek = (owner: string) => {
  const snapshot = ports.storage.read(owner);
  return snapshot ? { ...snapshot, pending: ports.storage.acknowledged(owner) !== snapshot.revision } : null;
 };
 const authenticate = async (owner: string, current: () => boolean) => {
  assertCurrent(current);
  if (!owner || await ports.currentOwner() !== owner) throw new CartSyncError('STALE_OWNER');
  assertCurrent(current);
 };
 return {
  peek,
  stage(owner: string, items: CartItem[], current: () => boolean = () => true) {
   // Copy at invocation, before waiting for another tab's short storage transaction.
   const copied = newSnapshot(owner, items, ports.revision());
   return snapshotLock(owner, () => {
    assertCurrent(current); const previous = ports.storage.read(owner);
    if (previous && JSON.stringify(previous.items) === JSON.stringify(copied.items)) return previous;
    ports.storage.write(copied); return copied;
   });
  },
  load(owner: string, seed: CartItem[], current: () => boolean = () => true) {
   const guest = serializeCartItems(seed);
   return ports.locks.withLock('network:' + owner, async () => {
    await authenticate(owner, current);
    const remote = await ports.remote.load(owner); assertCurrent(current);
    return snapshotLock(owner, () => {
     assertCurrent(current); const local = peek(owner);
     // A durable, unacknowledged local edit wins over an older server cart, including an empty edit.
     if (local?.pending) return local;
     const items = remote.length ? remote : guest;
     const result = newSnapshot(owner, items, ports.revision()); ports.storage.write(result);
     if (remote.length || !items.length) ports.storage.acknowledge(owner, result.revision);
     return result;
    });
   });
  },
  commit(owner: string, current: () => boolean = () => true) {
   return ports.locks.withLock('network:' + owner, async () => {
    await authenticate(owner, current);
    const snapshot = await snapshotLock(owner, () => peek(owner));
    if (!snapshot || !snapshot.pending) return;
    assertCurrent(current); await ports.remote.save(owner, snapshot.items);
    // Ack is a separate key. It must never replace a newer snapshot staged while HTTP was in flight.
    await snapshotLock(owner, () => ports.storage.acknowledge(owner, snapshot.revision));
   });
  },
 };
}
