import {expect,it} from 'vitest';
import {normalizePhone,isValidPhone} from './phone';
it.each(['09110000001','9110000001','+989110000001','00989110000001','989110000001','۹۸۹۱۱۰۰۰۰۰۰۱','٠٩١١٠٠٠٠٠٠١'])('normalizes the same Iranian phone identity: %s',phone=>{
 expect(normalizePhone(phone)).toBe('+989110000001');expect(isValidPhone(phone)).toBe(true);
});
it.each(['989110000002','+989110000002'])('does not confuse another phone with the signup owner: %s',phone=>expect(normalizePhone(phone)).not.toBe('+989110000001'));
it('preserves generic international E.164 numbers',()=>expect(normalizePhone('+12025550101')).toBe('+12025550101'));
it.each(['9891','9891100000017'])('does not invent a valid country code for malformed input: %s',phone=>expect(normalizePhone(phone)).toBe(phone));
