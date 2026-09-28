import Placement from "../models/placement.model.js";
import Coupon from "../models/coupon.model.js";
import { invalidatePlacements } from "../services/placements.service.js";
import { fail } from "../utils/fail.js";

const PLACEMENT_FIELDS = ["slot", "title", "subtitle", "image", "link", "cta", "theme", "target", "starts_at", "ends_at", "active", "sort"];
const pick = (body, fields) => Object.fromEntries(fields.filter((k) => body[k] !== undefined).map((k) => [k, body[k]]));

// GET /api/placements
export const listPlacements = async (req, res) => {
  const data = await Placement.find({}).sort({ createdAt: -1 });
  res.status(200).json({ success: true, data });
};

// POST /api/placements
export const createPlacement = async (req, res) => {
  const placement = await Placement.create(pick(req.body, PLACEMENT_FIELDS));
  invalidatePlacements();
  res.status(201).json({ success: true, data: placement });
};

// PUT /api/placements/:id
// Loads the document and saves it (rather than findByIdAndUpdate) so every validator — the
// image-required-per-slot check and the ends_at-after-starts_at window check — runs on edits too,
// not just on create.
export const updatePlacement = async (req, res) => {
  const placement = await Placement.findById(req.params.id);
  if (!placement) return res.status(404).json({ success: false, message: "الموضع غير موجود" });
  Object.assign(placement, pick(req.body, PLACEMENT_FIELDS));
  await placement.save();
  invalidatePlacements();
  res.status(200).json({ success: true, data: placement });
};

// DELETE /api/placements/:id
export const deletePlacement = async (req, res) => {
  const placement = await Placement.findByIdAndDelete(req.params.id);
  if (!placement) return res.status(404).json({ success: false, message: "الموضع غير موجود" });
  invalidatePlacements();
  res.status(200).json({ success: true, data: placement });
};

// `used` is not in the list: only orders move it (claim on placement, release on cancel/delete).
const COUPON_FIELDS = ["code", "type", "value", "min_subtotal", "starts_at", "ends_at", "max_uses", "active"];
const DUPLICATE_CODE = "هذا الكود موجود مسبقًا";

// Saves and maps the unique-index error to an Arabic 409 (the central handler's is generic).
async function saveCoupon(coupon) {
  try {
    return await coupon.save();
  } catch (err) {
    if (err?.code === 11000) throw fail(409, DUPLICATE_CODE);
    throw err;
  }
}

// GET /api/coupons
export const listCoupons = async (req, res) => {
  const data = await Coupon.find({}).sort({ createdAt: -1 });
  res.status(200).json({ success: true, data });
};

// POST /api/coupons
export const createCoupon = async (req, res) => {
  const coupon = await saveCoupon(new Coupon(pick(req.body, COUPON_FIELDS)));
  res.status(201).json({ success: true, data: coupon });
};

// PUT /api/coupons/:id — load-and-save so the percent ≤ 100 and window validators see the whole doc.
export const updateCoupon = async (req, res) => {
  const coupon = await Coupon.findById(req.params.id);
  if (!coupon) throw fail(404, "الكود غير موجود");
  Object.assign(coupon, pick(req.body, COUPON_FIELDS));
  res.status(200).json({ success: true, data: await saveCoupon(coupon) });
};

// DELETE /api/coupons/:id — orders keep their own snapshot, and releasing a deleted code is a no-op.
export const deleteCoupon = async (req, res) => {
  const coupon = await Coupon.findByIdAndDelete(req.params.id);
  if (!coupon) throw fail(404, "الكود غير موجود");
  res.status(200).json({ success: true, data: coupon });
};
