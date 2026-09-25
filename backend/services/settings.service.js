import Setting from "../models/setting.model.js";

const DEFAULTS = { whatsapp: "", instagram: "", delivery_fee: 0, free_delivery_over: 0 };
const KEYS = Object.keys(DEFAULTS);

const pick = (doc) => {
  const out = { ...DEFAULTS };
  if (doc) for (const k of KEYS) if (doc[k] !== undefined) out[k] = doc[k];
  return out;
};

// No write on read: an absent "shop" doc just reads as defaults.
export async function getSettings() {
  return pick(await Setting.findById("shop").lean());
}

export async function saveSettings(patch = {}) {
  const set = {};
  for (const k of KEYS) if (patch[k] !== undefined) set[k] = patch[k];
  const doc = await Setting.findByIdAndUpdate(
    "shop",
    { $set: set },
    { upsert: true, new: true, runValidators: true }
  ).lean();
  return pick(doc);
}
