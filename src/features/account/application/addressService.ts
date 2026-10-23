import type { Address, AddressInput } from '../domain/address';
export interface AddressRepository {
  list(ownerId: string): Promise<Address[]>;
  save(ownerId: string, id: string, address: AddressInput, isNew: boolean): Promise<void>;
  remove(ownerId: string, id: string): Promise<void>;
  clearDefaults(ownerId: string, exceptId?: string): Promise<void>;
  markDefault(ownerId: string, id: string): Promise<void>;
}
export function createAddressService(repository: AddressRepository, newId: () => string) {
  const owner = (id: string) => { if (!id) throw Error('Sign in before editing addresses'); };
  const owned = (addresses: Address[], id: string) => { if (!addresses.some(address => address.id === id)) throw Error('Address does not belong to this account'); };
  return {
    list(ownerId: string) { owner(ownerId); return repository.list(ownerId); },
    async save(ownerId: string, current: Address[], address: AddressInput) {
      owner(ownerId);
      if (address.id) owned(current, address.id);
      const id = address.id ?? newId();
      await repository.save(ownerId, id, address, !address.id);
      if (address.isDefault || (!current.length && !address.id)) {
        await repository.clearDefaults(ownerId, id);
        await repository.markDefault(ownerId, id);
      }
      return repository.list(ownerId);
    },
    async remove(ownerId: string, current: Address[], id: string) {
      owner(ownerId); owned(current, id);
      await repository.remove(ownerId, id);
      const remaining = current.filter(address => address.id !== id);
      if (remaining.length && !remaining.some(address => address.isDefault)) await repository.markDefault(ownerId, remaining[0].id);
      return repository.list(ownerId);
    },
    async setDefault(ownerId: string, current: Address[], id: string) {
      owner(ownerId); owned(current, id);
      await repository.clearDefaults(ownerId);
      await repository.markDefault(ownerId, id);
      return repository.list(ownerId);
    },
  };
}
