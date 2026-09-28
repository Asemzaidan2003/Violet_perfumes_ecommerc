import Coupon, { CODE_RE } from "../models/coupon.model.js";
import { money } from "../../storefront/js/shared/format.js";

const round2 = (n) => Math.round(n * 100) / 100;
// One message for unknown, inactive, out-of-window and used-up codes, so the public check
// can't be used to tell which codes exist.
export const INVALID_CODE = "الكود غير صالح أو منتهي";

export function normalizeCode(v) {
  const code = String(v ?? "").trim().toUpperCase();
  return CODE_RE.test(code) ? code : null;
}

// The discount formula; `setTotals` (order.service.js) and the public check both call it.
export const couponDiscount = (coupon, revenue) =>
  !coupon?.code ? 0 : round2(coupon.type === "percent" ? (revenue * coupon.value) / 100 : Math.min(coupon.value, revenue));

// Start inclusive, end exclusive (same rule as placements and offers).
const isLive = (c, now) => c.active && (!c.starts_at || c.starts_at <= now) && (!c.ends_at || now < c.ends_at);

export async function checkCoupon(code, subtotal, now = new Date(), session = null) {
  const c = normalizeCode(code);
  const coupon = c && await Coupon.findOne({ code: c }).session(session);
  if (!coupon || !isLive(coupon, now) || (coupon.max_uses > 0 && coupon.used >= coupon.max_uses)) {
    return { valid: false, discount: 0, message: INVALID_CODE };
  }
  if (subtotal < coupon.min_subtotal) {
    return { valid: false, discount: 0, message: `أضف ${money(round2(coupon.min_subtotal - subtotal))} لتفعيل هذا الكود` };
  }
  return { valid: true, discount: couponDiscount(coupon, subtotal), message: "تم تطبيق الكود", coupon };
}

// Guarded claim: matches only while the code is active and has a use left, so two concurrent
// orders on the last use can't both succeed. Returns the claimed coupon, or null.
export function claimCoupon(code, session) {
  return Coupon.findOneAndUpdate(
    { code, active: true, $or: [{ max_uses: 0 }, { $expr: { $lt: ["$used", "$max_uses"] } }] },
    { $inc: { used: 1 } },
    { session, new: true, runValidators: false }
  );
}

// Returns one use to the coupon the order claimed, by its _id, so a renamed or deleted-and-
// recreated code is never credited. Snapshots without an id fall back to the code. A deleted
// coupon (or one already at 0) is a no-op.
export function releaseCoupon(snapshot, session) {
  const match = snapshot.id ? { _id: snapshot.id } : { code: snapshot.code };
  return Coupon.updateOne({ ...match, used: { $gt: 0 } }, { $inc: { used: -1 } }, { session, runValidators: false });
}
