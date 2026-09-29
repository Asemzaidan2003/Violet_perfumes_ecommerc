export const MAX_QTY = 1000;
const round2 = (n) => Math.round(n * 100) / 100;

// Same rules as backend/catalog/pricing.js: the end of an offer is exclusive.
export function liveOffer(product, now = new Date()) {
  const offer = Number(product.p_offer_percentage) || 0;
  if (offer <= 0) return 0;
  if (product.offer_ends_at && !(now < new Date(product.offer_ends_at))) return 0;
  return offer;
}

export const effectivePrice = (product, sizeEntry, now = new Date()) =>
  round2(sizeEntry.price * (1 - liveOffer(product, now) / 100));

export const bottlesFor = (bottles, size) => bottles.filter((b) => b.capacity === parseFloat(size));
export const pickBottle = (bottles, size) => [...bottlesFor(bottles, size)].sort((a, b) => b.quantity - a.quantity)[0] ?? null;

const update = (cart, key, patch) => cart.map((l) => (l.key === key ? { ...l, ...patch } : l));

export function addToCart(cart, product, sizeEntry, bottles, now = new Date()) {
  const size = String(sizeEntry.size);
  const key = `${product._id}:${size}`;
  if (cart.some((l) => l.key === key)) {
    return cart.map((l) => (l.key === key ? { ...l, quantity: Math.min(MAX_QTY, l.quantity + 1) } : l));
  }
  return [...cart, {
    key, productId: product._id, name: product.p_name, image: product.p_image, size,
    quantity: 1, unitPrice: effectivePrice(product, sizeEntry, now), priceOverride: null,
    bottleId: pickBottle(bottles, size)?._id ?? null,
  }];
}

export function setQuantity(cart, key, raw) {
  const n = Math.floor(Number(raw));
  return update(cart, key, { quantity: Number.isFinite(n) ? Math.min(MAX_QTY, Math.max(1, n)) : 1 });
}

export function setPrice(cart, key, raw) {
  const line = cart.find((l) => l.key === key);
  const n = raw === "" || raw == null ? null : Number(raw);
  let priceOverride = n == null || !Number.isFinite(n) ? null : Math.max(0, round2(n));
  if (line && priceOverride === line.unitPrice) priceOverride = null;
  return update(cart, key, { priceOverride });
}

export const setBottle = (cart, key, bottleId) => update(cart, key, { bottleId: bottleId || null });
export const removeLine = (cart, key) => cart.filter((l) => l.key !== key);

export function restoreLine(cart, line, index) {
  if (cart.some((l) => l.key === line.key)) return cart;
  const next = [...cart];
  next.splice(Math.min(index, next.length), 0, line);
  return next;
}

export const linePrice = (line) => line.priceOverride ?? line.unitPrice;
export const lineTotal = (line) => round2(line.quantity * linePrice(line));

export function totals(cart) {
  return {
    items: cart.reduce((sum, l) => sum + l.quantity, 0),
    amount: round2(cart.reduce((sum, l) => sum + lineTotal(l), 0)),
  };
}

export function cartProblems(cart, bottles) {
  const problems = [];
  cart.forEach((l, i) => {
    if (l.bottleId) return;
    const message = bottlesFor(bottles, l.size).length
      ? `اختر زجاجة للسطر ${i + 1}`
      : `لا توجد زجاجة بسعة ${l.size} مل للسطر ${i + 1}`;
    problems.push({ key: l.key, message });
  });
  return problems;
}

// price is sent only when the cashier changed it, so the server's own price rules (offers) apply otherwise.
export function buildOrderBody(cart, customerId, paymentMethod = "Cash") {
  return {
    products: cart.map((l) => ({
      product_id: l.productId, size: l.size, quantity: l.quantity, bottle_id: l.bottleId,
      ...(l.priceOverride != null ? { price: l.priceOverride } : {}),
    })),
    customer_id: customerId,
    payment_method: paymentMethod,
  };
}
