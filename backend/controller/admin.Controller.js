import { getSettings, saveSettings } from "../services/settings.service.js";
import Interest from "../models/interest.model.js";

const INTEREST_STATUSES = ["new", "contacted", "closed"];

// GET /api/settings
export const getShopSettings = async (req, res) => {
  res.status(200).json({ success: true, data: await getSettings() });
};

// PUT /api/settings
export const updateShopSettings = async (req, res) => {
  res.status(200).json({ success: true, data: await saveSettings(req.body) });
};

// GET /api/interests?status=
export const getInterests = async (req, res) => {
  const filter = {};
  if (req.query.status) filter.status = req.query.status;
  const interests = await Interest.find(filter).sort({ createdAt: -1 }).limit(500);
  res.status(200).json({ success: true, data: interests });
};

// PUT /api/interests/:id
export const updateInterestStatus = async (req, res) => {
  if (!INTEREST_STATUSES.includes(req.body.status)) {
    return res.status(400).json({ success: false, message: "حالة غير صالحة" });
  }
  const interest = await Interest.findByIdAndUpdate(req.params.id, { status: req.body.status }, { new: true });
  if (!interest) return res.status(404).json({ success: false, message: "الطلب غير موجود" });
  res.status(200).json({ success: true, data: interest });
};
