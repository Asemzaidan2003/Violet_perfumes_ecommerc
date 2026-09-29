import mongoose from "mongoose";
import { IMAGE_URL } from "./product.model.js";
import { OVERRIDE_TOKENS } from "../store/theme.js";
import { GOVERNORATES } from "../store/validate.js";

// Strict 6-digit hex only — these values are interpolated straight into a <style> block server-side.
const HEX = { type: String, trim: true, match: [/^(#[0-9a-fA-F]{6})?$/, "لون غير صالح، يجب أن يكون رمز hex من 6 خانات"], default: "" };
const IMAGE = { type: String, trim: true, validate: { validator: (v) => v === "" || IMAGE_URL.test(v), message: "رابط صورة غير صالح" }, default: "" };
const HTTPS_URL = { type: String, trim: true, match: [/^(https:\/\/[^\s"'<>]+)?$/, "الرابط يجب أن يبدأ بـ https"], default: "" };

const overridesSchema = new mongoose.Schema(
  Object.fromEntries(OVERRIDE_TOKENS.map((k) => [k, HEX])),
  { _id: false }
);

export const HOME_SECTION_KEYS = [
  "aisles", "best_sellers", "promo_mid", "designers", "testers", "new_arrivals", "offers", "promo_bottom", "service",
];

// { label ≤ 30, link } — link is checked against validLink at the service layer (needs a live import
// of placements.model.js which would otherwise create a cycle with product.model.js).
const linkSchema = new mongoose.Schema(
  { label: { type: String, trim: true, maxlength: [30, "النص طويل جدًا"], default: "" }, link: { type: String, trim: true, default: "" } },
  { _id: false }
);

const sectionSchema = new mongoose.Schema(
  {
    key: { type: String, required: true, enum: { values: HOME_SECTION_KEYS, message: "قسم غير معروف: {VALUE}" } },
    visible: { type: Boolean, default: true },
    title: { type: String, trim: true, maxlength: [40, "العنوان طويل جدًا"], default: "" },
  },
  { _id: false }
);

const serviceItemSchema = new mongoose.Schema(
  {
    title: { type: String, trim: true, maxlength: [40, "العنوان طويل جدًا"], default: "" },
    text: { type: String, trim: true, maxlength: [80, "النص طويل جدًا"], default: "" },
  },
  { _id: false }
);

const settingSchema = new mongoose.Schema(
  {
    _id: { type: String, default: "shop" },
    store_name: { type: String, trim: true, maxlength: [40, "اسم المتجر طويل جدًا"], default: "نسمات" },
    tagline: { type: String, trim: true, maxlength: [80, "الشعار الفرعي طويل جدًا"], default: "بوتيك العطور في الأردن" },
    logo_light: IMAGE,
    logo_dark: IMAGE,
    favicon: IMAGE,
    share_image: IMAGE,
    whatsapp: { type: String, trim: true, match: [/^(\d{8,15})?$/, "رقم واتساب غير صالح"], default: "" },
    instagram: { type: String, trim: true, match: [/^(https:\/\/[^\s"'<>]+)?$/, "رابط انستغرام غير صالح"], default: "" },
    delivery_fee: { type: Number, min: 0, default: 0 },
    free_delivery_over: { type: Number, min: 0, default: 0 },
    theme: {
      type: new mongoose.Schema(
        { bg: HEX, surface: HEX, text: HEX, accent: HEX, overrides: { type: overridesSchema, default: () => ({}) } },
        { _id: false }
      ),
      default: () => ({}),
    },
    home: {
      type: new mongoose.Schema(
        {
          hero_title: { type: String, trim: true, maxlength: [80, "العنوان طويل جدًا"], default: "" },
          hero_subtitle: { type: String, trim: true, maxlength: [200, "النص طويل جدًا"], default: "" },
          cta_primary: { type: linkSchema, default: () => ({}) },
          cta_secondary: { type: linkSchema, default: () => ({}) },
          sections: { type: [sectionSchema], default: () => [] },
          service_items: { type: [serviceItemSchema], default: () => [] },
        },
        { _id: false }
      ),
      default: () => ({}),
    },
    contact: {
      type: new mongoose.Schema(
        {
          phone: { type: String, trim: true, maxlength: [20, "رقم الهاتف طويل جدًا"], default: "" },
          email: { type: String, trim: true, match: [/^([^\s@]+@[^\s@]+\.[^\s@]+)?$/, "بريد إلكتروني غير صالح"], default: "" },
          address: { type: String, trim: true, maxlength: [200, "العنوان طويل جدًا"], default: "" },
          map_url: HTTPS_URL,
          hours: { type: String, trim: true, maxlength: [120, "النص طويل جدًا"], default: "" },
        },
        { _id: false }
      ),
      default: () => ({}),
    },
    social: {
      type: new mongoose.Schema(
        { instagram: HTTPS_URL, tiktok: HTTPS_URL, facebook: HTTPS_URL, snapchat: HTTPS_URL },
        { _id: false }
      ),
      default: () => ({}),
    },
    footer: {
      type: new mongoose.Schema(
        {
          about_text: { type: String, trim: true, maxlength: [300, "النص طويل جدًا"], default: "" },
          copyright: { type: String, trim: true, maxlength: [120, "النص طويل جدًا"], default: "" },
        },
        { _id: false }
      ),
      default: () => ({}),
    },
    texts: {
      type: new mongoose.Schema(
        {
          oos_note: { type: String, trim: true, maxlength: [200, "النص طويل جدًا"], default: "" },
          checkout_note: { type: String, trim: true, maxlength: [200, "النص طويل جدًا"], default: "" },
          order_thanks: { type: String, trim: true, maxlength: [200, "النص طويل جدًا"], default: "" },
        },
        { _id: false }
      ),
      default: () => ({}),
    },
    delivery: {
      type: new mongoose.Schema(
        { governorates: { type: [{ type: String, enum: GOVERNORATES }], default: () => [...GOVERNORATES] } },
        { _id: false }
      ),
      default: () => ({ governorates: [...GOVERNORATES] }),
    },
    seo: {
      type: new mongoose.Schema(
        {
          home_title: { type: String, trim: true, maxlength: [70, "العنوان طويل جدًا"], default: "" },
          home_description: { type: String, trim: true, maxlength: [160, "النص طويل جدًا"], default: "" },
        },
        { _id: false }
      ),
      default: () => ({}),
    },
  },
  { timestamps: true }
);

export default mongoose.model("Setting", settingSchema);
