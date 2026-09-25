import { getSettings, saveSettings } from "../services/settings.service.js";

// GET /api/settings
export const getShopSettings = async (req, res) => {
  res.status(200).json({ success: true, data: await getSettings() });
};

// PUT /api/settings
export const updateShopSettings = async (req, res) => {
  res.status(200).json({ success: true, data: await saveSettings(req.body) });
};
