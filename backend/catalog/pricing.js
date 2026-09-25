const round2 = (n) => Math.round(n * 100) / 100;

// The ONE place a customer price is computed — used by the storefront display and the order
// service, so what the customer sees is what they're charged.
export function effectivePrice(product, sizeEntry, now = new Date()) {
  const offer = Number(product.p_offer_percentage) || 0;
  return round2(sizeEntry.price * (1 - offer / 100));
}
