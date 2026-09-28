import Placement from "../models/placement.model.js";
import { invalidatePlacements } from "../services/placements.service.js";

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
