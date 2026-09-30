import { z } from "zod";
import { normalizeSize } from "@store-shared/vocab.js";
import { normalizeNumberInput } from "@/lib/cart";

// Same rule as backend/store/imageUrl.js plus the "." placeholder ("no image yet").
export const IMAGE_URL = /^(\/img\/[a-f0-9]{24}(-480)?\.(webp|jpg|png)|https:\/\/[^\s"'<>]+)$/;
export const IMAGE_ERROR = "رابط الصورة غير صالح: يُقبل رابط رفع (/img/…) أو https:// فقط، ولا يُقبل http://";

const pad = (n) => String(n).padStart(2, "0");

export function isoToDatetimeLocal(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function datetimeLocalToIso(local) {
  if (!local) return null;
  const d = new Date(local);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

// "30ml", " ٥٠ مل ", "12,5" -> "30", "50", "12.5" (what the server stores).
export const normalizeSizeText = (s) => normalizeNumberInput(normalizeSize(normalizeNumberInput(String(s ?? ""))));

const sizeOk = (s) => { const t = normalizeSizeText(s); return /^\d+(\.\d+)?$/.test(t) && Number(t) > 0; };
const pct = (label) => z.number({ error: `${label} مطلوبة` }).min(0, `${label} بين 0 و100`).max(100, `${label} بين 0 و100`);

export const productSchema = z.object({
  p_name: z.string().trim().min(1, "اسم المنتج مطلوب"),
  p_category: z.string().min(1, "اختر الفئة"),
  status: z.enum(["available", "out of stock", "discontinued"]),
  visible: z.boolean(),
  p_offer_percentage: pct("نسبة العرض").nullable(),
  offer_ends_at: z.string(),
  oil_id: z.string().trim().min(1, "اختر الزيت"),
  oil_percentage: pct("نسبة الزيت"),
  alcohol_percentage: pct("نسبة الكحول"),
  p_image: z.string().trim().refine((v) => v === "" || v === "." || IMAGE_URL.test(v), IMAGE_ERROR),
  size_list: z.array(z.object({
    size: z.string().refine(sizeOk, "الحجم يجب أن يكون رقمًا موجبًا (مثال: 30)"),
    price: z.number({ error: "السعر مطلوب" }).min(0, "السعر لا يقل عن صفر"),
  })).min(1, "أضف حجمًا واحدًا على الأقل"),
  // Owned by Task 5's UI; carried through so an edit never drops them.
  families: z.array(z.string()),
  notes: z.object({ top: z.array(z.string()), heart: z.array(z.string()), base: z.array(z.string()) }),
  description: z.string().max(2000, "الوصف طويل جدًا (2000 حرف كحد أقصى)"),
  keywords: z.string().max(300, "الكلمات طويلة جدًا (300 حرف كحد أقصى)"),
  brand: z.string(),
  images: z.array(z.string()),
}).passthrough();

export const emptyValues = () => ({
  p_name: "", p_category: "", status: "available", visible: true, p_offer_percentage: 0, offer_ends_at: "",
  oil_id: "", oil_percentage: null, alcohol_percentage: null, p_image: "",
  size_list: [{ size: "", price: null }],
  families: [], notes: { top: [], heart: [], base: [] }, description: "", keywords: "", brand: "", images: [],
  offer_ends_orig: "",
});

// product: the GET /api/products/:id document (brand = raw id; a populated {_id} object is accepted too).
export function toFormValues(p) {
  if (!p) return emptyValues();
  const n = p.notes ?? {};
  return {
    p_name: p.p_name ?? "",
    p_category: p.p_category ?? "",
    status: p.status ?? "available",
    visible: p.visible !== false,
    p_offer_percentage: typeof p.p_offer_percentage === "number" ? p.p_offer_percentage : 0,
    offer_ends_at: isoToDatetimeLocal(p.offer_ends_at),
    oil_id: p.oil_id ?? "",
    oil_percentage: typeof p.oil_percentage === "number" ? p.oil_percentage : null,
    alcohol_percentage: typeof p.alcohol_percentage === "number" ? p.alcohol_percentage : null,
    p_image: p.p_image ?? "",
    size_list: (p.size_list ?? []).map((s) => ({ size: String(s?.size ?? ""), price: typeof s?.price === "number" ? s.price : null })),
    families: [...(p.families ?? [])],
    notes: { top: [...(n.top ?? [])], heart: [...(n.heart ?? [])], base: [...(n.base ?? [])] },
    description: p.description ?? "",
    keywords: p.keywords ?? "",
    brand: String(p.brand?._id ?? p.brand ?? ""),
    images: [...(p.images ?? [])],
    offer_ends_orig: p.offer_ends_at ? new Date(p.offer_ends_at).toISOString() : "",
  };
}

export function toPayload(v, { mode = "create" } = {}) {
  // Untouched offer end keeps the stored instant (the input has no seconds).
  const untouched = v.offer_ends_orig && isoToDatetimeLocal(v.offer_ends_orig) === v.offer_ends_at;
  const payload = {
    p_name: v.p_name.trim(),
    p_category: v.p_category,
    p_offer_percentage: v.p_offer_percentage ?? 0,
    offer_ends_at: untouched ? v.offer_ends_orig : datetimeLocalToIso(v.offer_ends_at),
    oil_id: v.oil_id.trim(),
    oil_percentage: v.oil_percentage,
    alcohol_percentage: v.alcohol_percentage,
    status: v.status,
    p_image: v.p_image.trim() || ".",
    visible: v.visible,
    size_list: v.size_list.map((s) => ({ size: normalizeSizeText(s.size), price: s.price })),
    families: v.families,
    notes: v.notes,
    description: v.description.trim(),
    keywords: v.keywords.trim(),
    images: v.images,
  };
  if (v.brand || mode === "edit") payload.brand = v.brand || null;
  return payload;
}
