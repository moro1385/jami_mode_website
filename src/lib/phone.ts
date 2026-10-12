/**
 * Phone number helpers.
 * Accepts Iranian mobile numbers (09xxxxxxxxx / +989xxxxxxxxx / 00989...)
 * and generic international E.164 numbers.
 */

export function normalizePhone(input: string): string {
  let value = input.replace(/[\s\-()._]/g, "").trim();
  // Convert Persian/Arabic digits
  value = value.replace(/[\u0660-\u0669\u06F0-\u06F9]/g, (d) =>
    String("0123456789"[d.charCodeAt(0) & 0xf])
  );
  if (value.startsWith("00")) value = `+${value.slice(2)}`;
  if (/^09\d{9}$/.test(value)) return `+98${value.slice(1)}`;
  if (/^9\d{9}$/.test(value)) return `+98${value}`;
  return value;
}

export function isValidPhone(input: string): boolean {
  const phone = normalizePhone(input);
  if (/^(\+98|0)?9\d{9}$/.test(phone)) return true;
  return /^\+[1-9]\d{7,14}$/.test(phone);
}

export function formatPhone(phone: string): string {
  if (/^\+989\d{9}$/.test(phone)) {
    const local = `0${phone.slice(3)}`;
    return `${local.slice(0, 4)} ${local.slice(4, 7)} ${local.slice(7)}`;
  }
  return phone;
}

export const PHONE_HELP = "";
