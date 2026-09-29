import mongoose from "mongoose";
import { IMAGE_URL } from "./product.model.js";
import { OVERRIDE_TOKENS } from "../store/theme.js";

// Strict 6-digit hex only — these values are interpolated straight into a <style> block server-side.
const HEX = { type: String, trim: true, match: [/^(#[0-9a-fA-F]{6})?$/, "لون غير صالح، يجب أن يكون رمز hex من 6 خانات"], default: "" };
const IMAGE = { type: String, trim: true, validate: { validator: (v) => v === "" || IMAGE_URL.test(v), message: "رابط صورة غير صالح" }, default: "" };

const overridesSchema = new mongoose.Schema(
  Object.fromEntries(OVERRIDE_TOKENS.map((k) => [k, HEX])),
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
  },
  { timestamps: true }
);

export default mongoose.model("Setting", settingSchema);
