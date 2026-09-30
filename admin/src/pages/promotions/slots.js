import { formatAmman, ammanLocalToIso } from "@/lib/amman";
import { isImageUrl, validLink } from "@/lib/links";
import { parseIntInput, parseNumberInput } from "@/lib/numbers";

export const SLOTS = [
  { key: "announcement", label: "الشريط الإعلاني", imageRequired: false, targeted: false },
  { key: "hero", label: "الشريحة الرئيسية", imageRequired: true, targeted: false },
  { key: "home_mid", label: "منتصف الصفحة الرئيسية", imageRequired: true, targeted: false },
  { key: "home_bottom", label: "أسفل الصفحة الرئيسية", imageRequired: true, targeted: false },
  { key: "collection_banner", label: "بانر صفحة التصنيف", imageRequired: true, targeted: true },
  { key: "grid_tile", label: "بطاقة ضمن شبكة المنتجات", imageRequired: true, targeted: true },
  { key: "product_promo", label: "شريط صفحة المنتج", imageRequired: false, targeted: false },
  { key: "cart_upsell", label: "بطاقة سلة التسوق", imageRequired: false, targeted: false },
];
export const slotOf = (key) => SLOTS.find((s) => s.key === key);

export function liveStatus(p, now = new Date()) {
  if (!p.active) return "متوقف";
  if (p.starts_at && new Date(p.starts_at) > now) return "مجدول";
  if (p.ends_at && now >= new Date(p.ends_at)) return "منتهي";
  return "مباشر";
}

export function storeLinkFor(p) {
  if (p.slot === "product_promo") return "/offers";
  if (slotOf(p.slot)?.targeted) {
    if (p.target?.category) return `/c/${p.target.category}`;
    if (p.target?.family) return `/family/${p.target.family}`;
    return "/c/men";
  }
  return "/";
}

export function scheduleText(p) {
  if (!p.starts_at && !p.ends_at) return "بلا جدولة";
  return `${p.starts_at ? formatAmman(p.starts_at) : "—"} → ${p.ends_at ? formatAmman(p.ends_at) : "—"}`;
}

const WINDOW_MSG = "تاريخ الانتهاء يجب أن يكون بعد البداية";
const badWindow = (a, b) => a && b && !(new Date(b) > new Date(a));

// f: form values (strings). Returns { field: Arabic message } (empty = valid).
export function validatePlacement(f) {
  const e = {};
  const slot = slotOf(f.slot);
  if (!f.title.trim()) e.title = "العنوان مطلوب"; else if (f.title.trim().length > 80) e.title = "الحد الأقصى 80 حرفًا";
  if (f.subtitle.trim().length > 160) e.subtitle = "الحد الأقصى 160 حرفًا";
  if (f.cta.trim().length > 30) e.cta = "الحد الأقصى 30 حرفًا";
  if (slot?.imageRequired && !f.image) e.image = "الصورة مطلوبة لهذا الموضع";
  else if (f.image && !isImageUrl(f.image)) e.image = "رابط صورة غير صالح";
  if (f.link.trim() && !validLink(f.link.trim())) e.link = "رابط غير صالح: يبدأ بـ / أو https://";
  if (badWindow(ammanLocalToIso(f.starts), ammanLocalToIso(f.ends))) e.ends = WINDOW_MSG;
  return e;
}

// `target` is ALWAYS sent for targeted slots ({} when both are "All") and {} for the others, so a stale target never survives a slot change.
export function buildPlacementBody(f) {
  const target = {};
  if (slotOf(f.slot)?.targeted) {
    if (f.category) target.category = f.category;
    if (f.family) target.family = f.family;
  }
  return {
    slot: f.slot, title: f.title.trim(), subtitle: f.subtitle.trim(), image: f.image, link: f.link.trim(), cta: f.cta.trim(), theme: f.theme,
    target, starts_at: ammanLocalToIso(f.starts), ends_at: ammanLocalToIso(f.ends), sort: parseNumberInput(f.sort) ?? 0, active: f.active,
  };
}

export function validateCoupon(f, { edit } = {}) {
  const e = {};
  if (!edit && !/^[A-Z0-9_-]{3,20}$/.test(f.code.trim())) e.code = "الكود يجب أن يكون من 3 إلى 20 حرفًا إنجليزيًا أو رقمًا";
  const v = parseNumberInput(f.value);
  if (v === null || v <= 0) e.value = "قيمة الخصم يجب أن تكون أكبر من صفر";
  else if (f.type === "percent" && v > 100) e.value = "النسبة المئوية لا تتجاوز 100";
  const min = f.min === "" ? 0 : parseNumberInput(f.min);
  if (min === null || min < 0) e.min = "الحد الأدنى للطلب غير صالح";
  const max = f.max === "" ? 0 : parseIntInput(f.max);
  if (max === null || max < 0 || String(f.max).includes(".")) e.max = "عدد الاستخدامات عدد صحيح (0 أو أكثر)";
  if (badWindow(ammanLocalToIso(f.starts), ammanLocalToIso(f.ends))) e.ends = WINDOW_MSG;
  return e;
}

export function buildCouponBody(f, { edit } = {}) {
  const body = {
    type: f.type, value: parseNumberInput(f.value), min_subtotal: f.min === "" ? 0 : parseNumberInput(f.min),
    starts_at: ammanLocalToIso(f.starts), ends_at: ammanLocalToIso(f.ends), max_uses: f.max === "" ? 0 : parseIntInput(f.max), active: f.active,
  };
  return edit ? body : { code: f.code.trim(), ...body }; // the code is immutable: never sent on edit
}
