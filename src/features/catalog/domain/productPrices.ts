import { MAX_PRODUCT_BATCH, validateStatusBatch } from './productManagement';
export type PriceChangeMode = 'fixed' | 'increase' | 'decrease';
export type ProductPriceTarget = { id: string; expectedPrice: number; nextPrice: number };
export const MAX_BASE_PRICE = 99_999_999; // Integer rials within the existing numeric(10,2) column.
const digits = (text: string) => text.trim().replace(/[۰-۹]/g, char => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(char))).replace(/[٠-٩]/g, char => String('٠١٢٣٤٥٦٧٨٩'.indexOf(char))).replace(/٫/g, '.');
const validPrice = (value: number, minimum: number) => Number.isSafeInteger(value) && value >= minimum && value <= MAX_BASE_PRICE;
export function previewProductPrices(products: { id: string; price: number }[], mode: PriceChangeMode, input: string): ProductPriceTarget[] {
 if (!['fixed', 'increase', 'decrease'].includes(mode)) throw Error('روش تغییر قیمت معتبر نیست.');
 const text = digits(input);
 if (mode === 'fixed' ? !/^[0-9]{1,8}$/.test(text) : !/^[0-9]{1,3}(\.[0-9]{1,2})?$/.test(text)) throw Error('مبلغ صحیح به ریال یا درصد با حداکثر دو رقم اعشار وارد کنید.');
 const amount = Number(text);
 if (mode === 'fixed' ? !validPrice(amount, 1) : amount < 0 || amount > 100) throw Error('مبلغ باید مثبت و حداکثر ۹۹٬۹۹۹٬۹۹۹ ریال باشد؛ درصد باید بین صفر و صد باشد.');
 const [whole, decimal = ''] = text.split('.');
 const basisPoints = Number(whole) * 100 + Number(decimal.padEnd(2, '0'));
 const targets = products.map(product => {
  if (!validPrice(product.price, 0)) throw Error('قیمت فعلی یکی از محصولات معتبر نیست؛ ابتدا آن محصول را بررسی کنید.');
  const factor = 10000 + (mode === 'increase' ? basisPoints : -basisPoints);
  const nextPrice = mode === 'fixed' ? amount : Number((BigInt(product.price) * BigInt(factor) + 5000n) / 10000n);
  if (!validPrice(nextPrice, 1)) throw Error('قیمت نهایی باید مثبت و حداکثر ۹۹٬۹۹۹٬۹۹۹ ریال باشد.');
  return { id: product.id, expectedPrice: product.price, nextPrice };
 });
 return validatePriceBatch(targets);
}
export function validatePriceBatch(targets: ProductPriceTarget[]) {
 if (!Array.isArray(targets) || !targets.length || targets.length > MAX_PRODUCT_BATCH) throw Error('انتخاب محصولات معتبر نیست.');
 validateStatusBatch(targets.map(target => ({ id: target.id, expectedActive: true })), true);
 if (targets.some(target => !validPrice(target.expectedPrice, 0) || !validPrice(target.nextPrice, 1))) throw Error('قیمت معتبر نیست.');
 return targets.map(target => ({ id: target.id, expectedPrice: target.expectedPrice, nextPrice: target.nextPrice }));
}
