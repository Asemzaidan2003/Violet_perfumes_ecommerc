import mongoose from "mongoose";
import { normalizeSize } from "../../storefront/js/shared/vocab.js";
import { normalizePhone, isJordanMobile } from "../../storefront/js/shared/phone.js";
import { fail } from "../utils/fail.js";

// Amman first, as shown to customers in the city select.
export const GOVERNORATES = [
  "عمّان", "الزرقاء", "إربد", "البلقاء", "المفرق", "جرش",
  "عجلون", "مادبا", "الكرك", "الطفيلة", "معان", "العقبة",
];

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_ITEMS = 20;
const MAX_QTY = 20;
const MAX_SIZE_LEN = 20;

// Trims, strips `<`/`>` (customer text is rendered on admin pages) and enforces a length range.
// `v` must be a string; `null`/`undefined` are treated as empty (fine for optional fields whose
// `min` is 0), but any other non-string (object, array, number, boolean) is a 400.
export function cleanText(v, { min, max, field }) {
  if (v != null && typeof v !== "string") throw fail(400, `${field} يجب أن يكون نصًا`);
  const s = String(v ?? "").trim().replace(/[<>]/g, "");
  if (s.length < min || s.length > max) throw fail(400, `${field} يجب أن يكون بين ${min} و ${max} حرفًا`);
  return s;
}

function checkPhone(raw) {
  const phone = normalizePhone(raw);
  if (!isJordanMobile(phone)) throw fail(400, "رقم الهاتف غير صالح — مثال: 0791234567");
  return phone;
}

// { items: [{ product_id, size, quantity }], customer: { name, phone, city, address, notes }, client_key, coupon? }
export function validateOrderBody(body = {}) {
  if (body.website) throw fail(400, "تعذر إرسال الطلب"); // honeypot

  const rawItems = Array.isArray(body.items) ? body.items : [];
  if (rawItems.length < 1 || rawItems.length > MAX_ITEMS) throw fail(400, `عدد المنتجات يجب أن يكون بين 1 و ${MAX_ITEMS}`);
  const items = rawItems.map((item, i) => {
    const n = i + 1;
    if (!mongoose.isValidObjectId(item?.product_id)) throw fail(400, `السطر ${n}: معرّف المنتج غير صالح`);
    const quantity = item?.quantity;
    if (typeof quantity !== "number" || !Number.isSafeInteger(quantity) || quantity < 1 || quantity > MAX_QTY) {
      throw fail(400, `السطر ${n}: الكمية يجب أن تكون بين 1 و ${MAX_QTY}`);
    }
    const size = normalizeSize(item?.size);
    if (!size) throw fail(400, `السطر ${n}: الحجم مطلوب`);
    return { product_id: item.product_id, size, quantity };
  });

  const c = body.customer ?? {};
  const name = cleanText(c.name, { min: 2, max: 80, field: "الاسم" });
  const phone = checkPhone(c.phone);
  const city = String(c.city ?? "").trim();
  if (!GOVERNORATES.includes(city)) throw fail(400, "المحافظة غير صالحة");
  const address = cleanText(c.address, { min: 5, max: 300, field: "العنوان" });
  const notes = c.notes ? cleanText(c.notes, { min: 0, max: 500, field: "الملاحظات" }) : "";

  const client_key = String(body.client_key ?? "");
  if (!UUID_V4.test(client_key)) throw fail(400, "معرّف الطلب غير صالح");

  // Only the shape is checked here; the order service normalizes, validates and claims it.
  let coupon;
  if (body.coupon != null) {
    if (typeof body.coupon !== "string" || body.coupon.trim().length > 20) throw fail(400, "كود الخصم غير صالح");
    coupon = body.coupon.trim() || undefined; // empty or only spaces = no coupon
  }

  return { items, customer: { name, phone, city, address, notes }, client_key, coupon };
}

// { product_id, size?, name, phone, note? }
// `size` here is only format-checked (string, capped length); whether it's one of the product's
// actual sizes needs the product record, so the controller checks that against `size_list`.
export function validateInterestBody(body = {}) {
  if (body.website) throw fail(400, "تعذر إرسال الطلب"); // honeypot

  if (!mongoose.isValidObjectId(body.product_id)) throw fail(400, "معرّف المنتج غير صالح");

  let size = null;
  if (body.size) {
    if (typeof body.size !== "string" || body.size.length > MAX_SIZE_LEN) throw fail(400, "الحجم غير صالح");
    size = normalizeSize(body.size);
  }

  const name = cleanText(body.name, { min: 2, max: 80, field: "الاسم" });
  const phone = checkPhone(body.phone);
  const note = body.note ? cleanText(body.note, { min: 0, max: 300, field: "الملاحظة" }) : "";

  return { product_id: body.product_id, size, name, phone, note };
}
