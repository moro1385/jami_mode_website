import { checkoutReceipts } from '@/features/payments/payments';
export { validOrderId } from '@/features/payments/domain/receipt';
export const consumeCheckoutReceipt = checkoutReceipts.consume;
