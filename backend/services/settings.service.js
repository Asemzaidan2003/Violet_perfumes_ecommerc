import Setting from "../models/setting.model.js";
import { fail } from "../utils/fail.js";
import { DEFAULT_THEME, OVERRIDE_TOKENS } from "../store/theme.js";
import { HOME_SECTION_KEYS } from "../models/setting.model.js";
import { validLink } from "../models/placement.model.js";
import { GOVERNORATES } from "../store/validate.js";

const DEFAULT_HOME = {
  hero_title: "{store_name} — عطرك يحكي عنك",
  hero_subtitle: "تركيبات فاخرة بزيوت عطرية مختارة، تُحضَّر لك بعناية وتصلك إلى باب بيتك في كل محافظات الأردن.",
  cta_primary: { label: "تسوّق الرجالي", link: "/c/men" },
  cta_secondary: { label: "تسوّق النسائي", link: "/c/women" },
  sections: HOME_SECTION_KEYS.map((key) => ({ key, visible: true, title: "" })),
  service_items: [
    { title: "توصيل لكل الأردن", text: "مجاني للطلبات فوق {free_delivery_over}" },
    { title: "الدفع عند الاستلام", text: "ادفع نقدًا عند وصول طلبك" },
    { title: "خدمة واتساب", text: "نرد على استفساراتك بسرعة" },
  ],
};
const DEFAULT_CONTACT = { phone: "", email: "", address: "", map_url: "", hours: "" };
const DEFAULT_SOCIAL = { instagram: "", tiktok: "", facebook: "", snapchat: "" };
const DEFAULT_FOOTER = {
  about_text: "عطور مختارة بعناية، تُحضَّر لك في عمّان وتصلك إلى أي مكان في الأردن.",
  copyright: "© {year} {store_name}. جميع الحقوق محفوظة.",
};
const DEFAULT_TEXTS = {
  oos_note: "نحضّره لك عند الطلب وقد يستغرق وقتًا أطول",
  checkout_note: "",
  order_thanks: "سنتواصل معك قريبًا لتأكيد طلبك وموعد التوصيل. الدفع نقدًا عند الاستلام.",
};
const DEFAULT_DELIVERY = { governorates: [...GOVERNORATES] };
const DEFAULT_SEO = { home_title: "", home_description: "" };

const DEFAULTS = {
  store_name: "نسمات", tagline: "بوتيك العطور في الأردن",
  logo_light: "", logo_dark: "", favicon: "", share_image: "",
  whatsapp: "", instagram: "", delivery_fee: 0, free_delivery_over: 0, theme: {},
  home: DEFAULT_HOME, contact: DEFAULT_CONTACT, social: DEFAULT_SOCIAL, footer: DEFAULT_FOOTER,
  texts: DEFAULT_TEXTS, delivery: DEFAULT_DELIVERY, seo: DEFAULT_SEO,
};
const KEYS = Object.keys(DEFAULTS);
const NESTED_OBJECT_KEYS = ["contact", "social", "footer", "texts", "seo"]; // simple {..string fields} merge
const SIMPLE_KEYS = KEYS.filter((k) => k !== "theme" && k !== "home" && !NESTED_OBJECT_KEYS.includes(k) && k !== "delivery");

const pick = (doc) => {
  const out = {
    ...DEFAULTS,
    theme: { ...DEFAULT_THEME, overrides: {} },
    home: { ...DEFAULT_HOME, cta_primary: { ...DEFAULT_HOME.cta_primary }, cta_secondary: { ...DEFAULT_HOME.cta_secondary }, sections: DEFAULT_HOME.sections.map((s) => ({ ...s })), service_items: DEFAULT_HOME.service_items.map((s) => ({ ...s })) },
    contact: { ...DEFAULT_CONTACT }, social: { ...DEFAULT_SOCIAL }, footer: { ...DEFAULT_FOOTER },
    texts: { ...DEFAULT_TEXTS }, delivery: { ...DEFAULT_DELIVERY }, seo: { ...DEFAULT_SEO },
  };
  if (doc) {
    for (const k of SIMPLE_KEYS) if (doc[k] !== undefined) out[k] = doc[k];
    if (doc.theme) for (const k of Object.keys(DEFAULT_THEME)) if (doc.theme[k]) out.theme[k] = doc.theme[k];
    if (doc.theme?.overrides) {
      const ov = {};
      for (const k of OVERRIDE_TOKENS) if (doc.theme.overrides[k]) ov[k] = doc.theme.overrides[k];
      out.theme.overrides = ov;
    }
    if (doc.home) {
      if (doc.home.hero_title) out.home.hero_title = doc.home.hero_title;
      if (doc.home.hero_subtitle) out.home.hero_subtitle = doc.home.hero_subtitle;
      if (doc.home.cta_primary && (doc.home.cta_primary.label || doc.home.cta_primary.link)) out.home.cta_primary = { label: doc.home.cta_primary.label || "", link: doc.home.cta_primary.link || "" };
      if (doc.home.cta_secondary && (doc.home.cta_secondary.label || doc.home.cta_secondary.link)) out.home.cta_secondary = { label: doc.home.cta_secondary.label || "", link: doc.home.cta_secondary.link || "" };
      if (Array.isArray(doc.home.sections) && doc.home.sections.length) out.home.sections = doc.home.sections.map((s) => ({ key: s.key, visible: s.visible !== false, title: s.title || "" }));
      if (Array.isArray(doc.home.service_items) && doc.home.service_items.length) out.home.service_items = doc.home.service_items.map((s) => ({ title: s.title || "", text: s.text || "" }));
    }
    for (const k of NESTED_OBJECT_KEYS) {
      if (doc[k]) for (const f of Object.keys(out[k])) if (doc[k][f]) out[k][f] = doc[k][f];
    }
    // Legacy instagram: read the old top-level field only if the new social.instagram is empty.
    if (!out.social.instagram && out.instagram) out.social.instagram = out.instagram;
    if (doc.delivery?.governorates?.length) out.delivery.governorates = doc.delivery.governorates.filter((g) => GOVERNORATES.includes(g));
    if (!out.delivery.governorates.length) out.delivery.governorates = [...GOVERNORATES];
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

const CUSTOM_MERGE_KEYS = ["theme", "home", "contact", "social", "footer", "texts", "delivery", "seo"];

export async function saveSettings(patch = {}) {
  const set = {};
  for (const k of KEYS) {
    if (CUSTOM_MERGE_KEYS.includes(k)) continue;
    if (patch[k] !== undefined) set[k] = patch[k];
  }

  if (patch.theme !== undefined) {
    const current = pick(await Setting.findById("shop").lean()).theme;
    const merged = { ...current };
    for (const k of Object.keys(DEFAULT_THEME)) {
      const v = patch.theme[k];
      if (v !== undefined && v !== "") merged[k] = v;
    }
    if (patch.theme.overrides !== undefined) {
      const overrides = { ...current.overrides };
      for (const k of Object.keys(patch.theme.overrides)) {
        if (!OVERRIDE_TOKENS.includes(k)) throw fail(400, `رمز لون غير معروف: ${k}`);
        const v = patch.theme.overrides[k];
        if (v === "" || v == null) { delete overrides[k]; continue; }
        if (typeof v !== "string" || !/^#[0-9a-fA-F]{6}$/.test(v)) throw fail(400, "قيمة لون غير صالحة، يجب أن تكون hex من 6 خانات");
        overrides[k] = v;
      }
      merged.overrides = overrides;
    }
    set.theme = merged;
  }

  const currentPicked = () => pick(currentDoc);
  let currentDoc; // lazily loaded once, only if a nested key needs merging
  const needsCurrent = ["home", "contact", "social", "footer", "texts", "delivery", "seo"].some((k) => patch[k] !== undefined);
  if (needsCurrent) currentDoc = await Setting.findById("shop").lean();

  if (patch.home !== undefined) {
    const current = currentPicked().home;
    const merged = { ...current };
    const h = patch.home;
    if (h.hero_title !== undefined) merged.hero_title = String(h.hero_title).trim().slice(0, 80);
    if (h.hero_subtitle !== undefined) merged.hero_subtitle = String(h.hero_subtitle).trim().slice(0, 200);
    for (const ctaKey of ["cta_primary", "cta_secondary"]) {
      if (h[ctaKey] !== undefined) {
        const label = String(h[ctaKey]?.label ?? "").trim().slice(0, 30);
        const link = String(h[ctaKey]?.link ?? "").trim();
        if (link && !validLink(link)) throw fail(400, "رابط غير صالح");
        merged[ctaKey] = { label, link };
      }
    }
    if (h.sections !== undefined) {
      if (!Array.isArray(h.sections)) throw fail(400, "قائمة الأقسام غير صالحة");
      merged.sections = h.sections.map((s) => {
        if (!HOME_SECTION_KEYS.includes(s?.key)) throw fail(400, `قسم غير معروف: ${s?.key}`);
        return { key: s.key, visible: s.visible !== false, title: String(s.title ?? "").trim().slice(0, 40) };
      });
    }
    if (h.service_items !== undefined) {
      if (!Array.isArray(h.service_items) || h.service_items.length > 4) throw fail(400, "عدد عناصر الخدمة يجب ألا يتجاوز 4");
      merged.service_items = h.service_items.map((s) => ({
        title: String(s?.title ?? "").trim().slice(0, 40),
        text: String(s?.text ?? "").trim().slice(0, 80),
      }));
    }
    set.home = merged;
  }

  for (const k of ["contact", "footer", "texts", "seo"]) {
    if (patch[k] === undefined) continue;
    const current = currentPicked()[k];
    const merged = { ...current };
    for (const f of Object.keys(current)) {
      if (patch[k][f] === undefined) continue;
      const v = String(patch[k][f]).trim();
      if (k === "contact" && f === "map_url" && v && !/^https:\/\//.test(v)) throw fail(400, "رابط الخريطة يجب أن يبدأ بـ https");
      merged[f] = v;
    }
    set[k] = merged;
  }

  if (patch.social !== undefined) {
    const current = currentPicked().social;
    const merged = { ...current };
    for (const f of Object.keys(current)) {
      if (patch.social[f] === undefined) continue;
      const v = String(patch.social[f]).trim();
      if (v && !/^https:\/\//.test(v)) throw fail(400, "الرابط يجب أن يبدأ بـ https");
      merged[f] = v;
    }
    set.social = merged;
  }

  if (patch.delivery !== undefined) {
    if (!Array.isArray(patch.delivery.governorates)) throw fail(400, "قائمة المحافظات غير صالحة");
    const govs = patch.delivery.governorates.filter((g) => GOVERNORATES.includes(g));
    if (!govs.length) throw fail(400, "يجب تفعيل محافظة واحدة على الأقل");
    set.delivery = { governorates: govs };
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
