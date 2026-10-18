// Payment states are owned by server verification. Legacy pending/unknown states
// require reconciliation; a generic status control cannot establish payment.
export function fulfillmentOptions(status: string): string[] {
  return [status, ...(["confirmed", "processing", "shipped", "delivered"].includes(status)
    ? ["processing", "shipped", "delivered", "cancelled"].filter(value => value !== status)
    : [])];
}
