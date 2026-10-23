import { CURRENCY_CODE, type CatalogProduct } from "../domain/catalog";

export function formatPrice(amount: string | number, currencyCode = CURRENCY_CODE) {
  const value = typeof amount === "string" ? parseFloat(amount) : amount;
  const label = currencyCode === "IRR" ? "ریال" : currencyCode;
  return Number(value).toLocaleString('fa-IR') + ' ' + label;
}

export function productImage(product: CatalogProduct) {
  return product.node.images?.edges?.[0]?.node?.url ?? "/placeholder.svg";
}
