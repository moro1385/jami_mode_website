import { validatedCartItems, serializeCartItems, type CartItem } from './cart';
export type CartSnapshot = { version: 1; ownerId: string; revision: string; items: CartItem[] };
export class CartSyncError extends Error { constructor(public code: 'INVALID_SNAPSHOT' | 'UNAVAILABLE' | 'STALE_OWNER') { super(code); } }
export function snapshotFromRaw(raw: string | null, ownerId: string): CartSnapshot | null {
 if (raw === null) return null;
 try {
  if (!ownerId || ownerId.length > 128 || raw.length > 2_000_000) throw Error();
  const value = JSON.parse(raw), items = validatedCartItems(value?.items);
  if (value?.version !== 1 || value.ownerId !== ownerId || typeof value.revision !== 'string' || !value.revision || value.revision.length > 100 || !items) throw Error();
  return { version: 1, ownerId, revision: value.revision, items };
 } catch { throw new CartSyncError('INVALID_SNAPSHOT'); }
}
export function newSnapshot(ownerId: string, items: CartItem[], revision: string): CartSnapshot {
 const snapshot = snapshotFromRaw(JSON.stringify({ version: 1, ownerId, revision, items: serializeCartItems(items) }), ownerId);
 if (!snapshot) throw new CartSyncError('INVALID_SNAPSHOT');
 return snapshot;
}
