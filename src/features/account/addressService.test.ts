import { describe, it, expect, vi } from 'vitest';
import { createAddressService, type AddressRepository } from './application/addressService';
import { addressFields, addressFromRecord, type Address } from './domain/address';
import { allowedProfileEdits, addressFormInput, emptyAddressForm, validateAddressForm, validateProfileForm } from './domain/forms';
const first: Address = { id: 'first', label: 'home', recipient: 'Name', phone: '+989110000001', country: 'Iran', city: 'City', line1: 'street', line2: '', postalCode: '123', isDefault: true };
const second = { ...first, id: 'second', isDefault: false };
function setup() {
  const repository = { list: vi.fn().mockResolvedValue([first]), save: vi.fn(), remove: vi.fn(), clearDefaults: vi.fn(), markDefault: vi.fn() } satisfies AddressRepository;
  return { repository, service: createAddressService(repository, () => 'generated-id') };
}
describe('account address use cases', () => {
  it.each(['save', 'remove', 'setDefault'] as const)('rejects missing owner for %s', async action => {
    const { service, repository } = setup();
    const run = action === 'save' ? service.save('', [], first) : service[action]('', [first], first.id);
    await expect(run).rejects.toThrow('Sign in');
    expect(repository.save).not.toHaveBeenCalled(); expect(repository.remove).not.toHaveBeenCalled(); expect(repository.clearDefaults).not.toHaveBeenCalled();
  });
  it.each(['save', 'remove', 'setDefault'] as const)('rejects an unowned target before %s', async action => {
    const { service, repository } = setup();
    const run = action === 'save' ? service.save('owner', [first], second) : service[action]('owner', [first], second.id);
    await expect(run).rejects.toThrow('belong');
    expect(repository.save).not.toHaveBeenCalled(); expect(repository.remove).not.toHaveBeenCalled(); expect(repository.clearDefaults).not.toHaveBeenCalled();
  });
  it('creates a first address and establishes its default before returning persisted rows', async () => {
    const { service, repository } = setup();
    const input = { ...first, id: undefined, isDefault: false };
    const rows = await service.save('owner', [], input);
    expect(repository.save).toHaveBeenCalledWith('owner', 'generated-id', input, true);
    expect(repository.clearDefaults).toHaveBeenCalledWith('owner', 'generated-id');
    expect(repository.markDefault).toHaveBeenCalledWith('owner', 'generated-id');
    expect(repository.markDefault.mock.invocationCallOrder[0]).toBeLessThan(repository.list.mock.invocationCallOrder[0]);
    expect(rows).toEqual([first]);
  });
  it('does not clear defaults for a nondefault edit', async () => {
    const { service, repository } = setup();
    await service.save('owner', [first, second], second);
    expect(repository.save).toHaveBeenCalledWith('owner', second.id, second, false);
    expect(repository.clearDefaults).not.toHaveBeenCalled();
  });
  it('promotes the first remaining address after deleting the default', async () => {
    const { service, repository } = setup();
    await service.remove('owner', [first, second], first.id);
    expect(repository.remove).toHaveBeenCalledWith('owner', first.id);
    expect(repository.markDefault).toHaveBeenCalledWith('owner', second.id);
  });
  it('does not promote anything after removing the last address', async () => {
    const { service, repository } = setup(); await service.remove('owner', [first], first.id);
    expect(repository.markDefault).not.toHaveBeenCalled();
  });
  it('stops a default change after the first write fails', async () => {
    const { service, repository } = setup(); repository.clearDefaults.mockRejectedValue(Error('denied'));
    await expect(service.setDefault('owner', [first, second], second.id)).rejects.toThrow('denied');
    expect(repository.markDefault).not.toHaveBeenCalled(); expect(repository.list).not.toHaveBeenCalled();
  });
  it('propagates failure after defaults were cleared for caller recovery', async () => {
    const { service, repository } = setup(); repository.markDefault.mockRejectedValue(Error('missing'));
    await expect(service.setDefault('owner', [first], first.id)).rejects.toThrow('missing');
    expect(repository.list).not.toHaveBeenCalled();
  });
});
describe('account form and storage contracts', () => {
  it('retains address validation and normalized phone while leaving text unchanged', () => {
    const form = { ...emptyAddressForm, ...first, phone: '۰۹۱۱۰۰۰۰۰۰۱' };
    expect(validateAddressForm(form)).toEqual({});
    expect(addressFormInput(form, 'new')).toMatchObject({ id: undefined, phone: '+989110000001', label: first.label });
    expect(Object.keys(validateAddressForm(emptyAddressForm))).toEqual(['label', 'recipient', 'phone', 'country', 'city', 'line1', 'postalCode']);
  });
  it('excludes unchecked runtime properties from storage and retains optional line2 null', () => {
    const fields = addressFields('owner', first.id, { ...first, wallet_balance: 999 } as Address);
    expect(fields).toMatchObject({ user_id: 'owner', postal_code: '123', line2: null });
    expect(fields).not.toHaveProperty('wallet_balance');
  });
  it('maps legacy nullable storage fields to existing display fallbacks', () => {
    expect(addressFromRecord({ id: 'id', label: null, recipient: null, phone: null, country: null, city: null, line1: null, line2: null, postal_code: null, is_default: null })).toEqual({ ...emptyAddressForm, id: 'id' });
  });
  it('retains name/email validation and excludes financial profile edits', () => {
    expect(validateProfileForm({ firstName: '', lastName: ' ', email: 'invalid' })).toHaveProperty('email');
    expect(validateProfileForm({ firstName: 'Name', lastName: 'Last', email: '' })).toEqual({});
    expect(allowedProfileEdits({ firstName: 'Name', wallet: { balance: 9 }, phone: 'changed' } as { firstName: string })).toEqual({ firstName: 'Name' });
  });
});
