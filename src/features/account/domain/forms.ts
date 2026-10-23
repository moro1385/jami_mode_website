import { isValidPhone, normalizePhone } from '@/lib/phone';
import type { AddressInput } from './address';
export const emptyAddressForm = {
  label: '', recipient: '', phone: '', country: '', city: '', line1: '', line2: '', postalCode: '', isDefault: false,
};
export function validateAddressForm(form: typeof emptyAddressForm) {
  const next: Record<string, string> = {};
  if (!form.label.trim()) next.label = 'برای این آدرس یک نام انتخاب کنید (خانه، محل کار…).';
  if (!form.recipient.trim()) next.recipient = 'نام گیرنده الزامی است.';
  if (!form.phone.trim()) next.phone = 'شماره تماس الزامی است.';
  else if (!isValidPhone(form.phone)) next.phone = 'یک شماره موبایل معتبر وارد کنید.';
  if (!form.country.trim()) next.country = 'کشور الزامی است.';
  if (!form.city.trim()) next.city = 'شهر الزامی است.';
  if (!form.line1.trim()) next.line1 = 'آدرس خیابان الزامی است.';
  if (!form.postalCode.trim()) next.postalCode = 'کد پستی الزامی است.';
  return next;
}
export function addressFormInput(form: typeof emptyAddressForm, editing: string | null): AddressInput {
  return { ...form, phone: normalizePhone(form.phone), id: editing === 'new' ? undefined : (editing ?? undefined) };
}
export type ProfileEdits = { firstName?: string; lastName?: string; email?: string };
export function allowedProfileEdits(patch: ProfileEdits): ProfileEdits {
  const result: ProfileEdits = {};
  if (patch.firstName !== undefined) result.firstName = patch.firstName;
  if (patch.lastName !== undefined) result.lastName = patch.lastName;
  if (patch.email !== undefined) result.email = patch.email;
  return result;
}
export function validateProfileForm(form: { firstName: string; lastName: string; email: string }) {
  const next: Record<string, string> = {};
  if (!form.firstName.trim()) next.firstName = 'نام الزامی است.';
  if (!form.lastName.trim()) next.lastName = 'نام خانوادگی الزامی است.';
  if (form.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) next.email = 'یک آدرس ایمیل معتبر وارد کنید.';
  return next;
}
