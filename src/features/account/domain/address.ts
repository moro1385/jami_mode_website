export interface Address {
  id: string;
  label: string;
  recipient: string;
  phone: string;
  country: string;
  city: string;
  line1: string;
  line2?: string;
  postalCode: string;
  isDefault: boolean;
}


export type AddressInput = Omit<Address, 'id'> & { id?: string };
export type StoredAddress = {
  id: string; label: string | null; recipient: string | null; phone: string | null;
  country: string | null; city: string | null; line1: string | null; line2: string | null;
  postal_code: string | null; is_default: boolean | null;
};
export function addressFromRecord(row: StoredAddress): Address {
  return { id: row.id, label: row.label || '', recipient: row.recipient || '', phone: row.phone || '',
    country: row.country || '', city: row.city || '', line1: row.line1 || '', line2: row.line2 || '',
    postalCode: row.postal_code || '', isDefault: row.is_default || false };
}
export function addressFields(ownerId: string, id: string, address: AddressInput) {
  return { id, user_id: ownerId, label: address.label, recipient: address.recipient, phone: address.phone,
    country: address.country, city: address.city, line1: address.line1, line2: address.line2 || null,
    postal_code: address.postalCode, is_default: address.isDefault };
}
