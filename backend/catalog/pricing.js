const round2 = (n) => Math.round(n * 100) / 100;

// The offer percentage in effect right now: p_offer_percentage while it is > 0 and
// (offer_ends_at unset or now < offer_ends_at). End is exclusive — the offer is over
// starting exactly at offer_ends_at.
export function liveOffer(product, now = new Date()) {
  const offer = Number(product.p_offer_percentage) || 0;
  if (offer <= 0) return 0;
  if (product.offer_ends_at && !(now < new Date(product.offer_ends_at))) return 0;
  return offer;
}

// The ONE place a customer price is computed — used by the storefront display and the order
// service, so what the customer sees is what they're charged.
export function effectivePrice(product, sizeEntry, now = new Date()) {
  const offer = liveOffer(product, now);
  return round2(sizeEntry.price * (1 - offer / 100));
}
