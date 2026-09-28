import Setting from "../models/setting.model.js";
import { fail } from "../utils/fail.js";
import { DEFAULT_THEME, validateContrast } from "../store/theme.js";

const DEFAULTS = { whatsapp: "", instagram: "", delivery_fee: 0, free_delivery_over: 0, theme: {} };
const KEYS = Object.keys(DEFAULTS);

const pick = (doc) => {
  const out = { ...DEFAULTS, theme: { ...DEFAULT_THEME } };
  if (doc) {
    for (const k of KEYS) {
      if (k === "theme") continue;
      if (doc[k] !== undefined) out[k] = doc[k];
    }
    if (doc.theme) for (const k of Object.keys(DEFAULT_THEME)) if (doc.theme[k]) out.theme[k] = doc.theme[k];
  }
  return out;
};

let cache = DEFAULTS; // ponytail: best-effort sync snapshot for the rate limiter, refreshed on every getSettings() call

// No write on read: an absent "shop" doc just reads as defaults.
export async function getSettings() {
  const settings = pick(await Setting.findById("shop").lean());
  cache = settings;
  return settings;
}

// Synchronous, possibly-stale read (e.g. the rate limiter's Arabic 429 message needs the shop's
// WhatsApp number but must stay synchronous). Populated the first time getSettings() runs.
export function getCachedSettings() {
  return cache;
}

export async function saveSettings(patch = {}) {
  const set = {};
  for (const k of KEYS) {
    if (k === "theme") continue;
    if (patch[k] !== undefined) set[k] = patch[k];
  }

  if (patch.theme !== undefined) {
    const current = pick(await Setting.findById("shop").lean()).theme;
    const merged = { ...current };
    for (const k of Object.keys(DEFAULT_THEME)) {
      const v = patch.theme[k];
      if (v !== undefined && v !== "") merged[k] = v;
    }
    const failures = validateContrast(merged);
    if (failures.length) throw fail(400, `تباين الألوان غير كافٍ: ${failures.join("، ")}`);
    set.theme = merged;
  }

  const doc = await Setting.findByIdAndUpdate(
    "shop",
    { $set: set },
    { upsert: true, new: true, runValidators: true }
  ).lean();
  const settings = pick(doc);
  cache = settings;
  return settings;
}
