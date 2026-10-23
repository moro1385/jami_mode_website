import { validatedCartItems, serializeCartItems, type CartItem } from '../domain/cart';
export interface CartRepository {
  read(ownerId: string): Promise<unknown>;
  write(ownerId: string, items: ReturnType<typeof serializeCartItems>, updatedAt: string): Promise<{ error: unknown }>;
}
export function createCartService(repository: CartRepository, now: () => string, reportError: (error: unknown) => void) {
  const owner = (id: string) => { if (!id) throw Error('Cart owner required'); };
  const pending = new Map<string, Promise<void>>();
  const write = (ownerId: string, items: CartItem[]) => {
    owner(ownerId);
    // Capture at invocation, not after waiting: caller mutations cannot alter the queued write.
    const snapshot = serializeCartItems(items);
    const result = (pending.get(ownerId) ?? Promise.resolve()).then(() => repository.write(ownerId, snapshot, now()));
    // Failed writes release the queue too. Errors retain save/flush's separate contracts.
    const drained = result.then(() => {}, () => {});
    pending.set(ownerId, drained);
    void drained.then(() => { if (pending.get(ownerId) === drained) pending.delete(ownerId); });
    return result;
  };
  return {
    async load(ownerId: string): Promise<CartItem[]> {
      owner(ownerId); const items = validatedCartItems((await repository.read(ownerId)) ?? []);
      if (!items) throw Error('Invalid remote cart');
      return items;
    },
    async save(ownerId: string, items: CartItem[]) {
      owner(ownerId);
      const { error } = await write(ownerId, items);
      if (error) throw error;
    },
    async flush(ownerId: string, items: CartItem[]) {
      owner(ownerId);
      // Compatibility: signout flush logs resolved database errors, while thrown transports still reject.
      const { error } = await write(ownerId, items);
      if (error) reportError(error);
    },
  };
}
