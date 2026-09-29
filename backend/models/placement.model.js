import mongoose from "mongoose";
import { FAMILY_KEYS } from "../../storefront/js/shared/vocab.js";
import { IMAGE_URL } from "./product.model.js";
import { getCategories } from "../services/categories.service.js";

export const SLOTS = [
  "announcement",
  "hero",
  "home_mid",
  "home_bottom",
  "collection_banner",
  "grid_tile",
  "product_promo",
  "cart_upsell",
];
export const IMAGE_SLOTS = ["hero", "home_mid", "home_bottom", "collection_banner", "grid_tile"];
export const THEMES = ["dark", "light", "gold"];

// Internal path (no protocol-relative or backslash tricks) or an https absolute URL.
export const validLink = (l) =>
  typeof l === "string" &&
  (/^\/(?![\/\\])\S*$/.test(l) ||
    (() => {
      try {
        return new URL(l).protocol === "https:";
      } catch {
        return false;
      }
    })());

const placementSchema = new mongoose.Schema(
  {
    slot: { type: String, required: true, enum: { values: SLOTS, message: "موضع غير صالح" } },
    title: { type: String, required: true, trim: true, maxlength: 80 },
    subtitle: { type: String, trim: true, maxlength: 160 },
    image: {
      type: String,
      trim: true,
      // `required` alone only fires when the field is entirely absent from the write (Mongoose
      // skips a plain `validate` for an undefined path); `validate` also covers an explicit
      // empty string, e.g. a PUT that clears an existing hero image.
      required: [function () { return IMAGE_SLOTS.includes(this.slot); }, "الصورة مطلوبة لهذا الموضع"],
      validate: {
        validator(v) {
          if (v) return IMAGE_URL.test(v);
          return !IMAGE_SLOTS.includes(this.slot);
        },
        message: "الصورة مطلوبة لهذا الموضع",
      },
    },
    link: {
      type: String,
      trim: true,
      validate: { validator: (v) => !v || validLink(v), message: "رابط غير صالح" },
    },
    cta: { type: String, trim: true, maxlength: 30 },
    theme: { type: String, enum: { values: THEMES, message: "سمة غير صالحة" }, default: "dark" },
    target: {
      category: {
        type: String,
        validate: {
          validator: async (v) => !v || (await getCategories()).some((c) => c.slug === v),
          message: "فئة غير صالحة",
        },
      },
      family: { type: String, enum: { values: [...FAMILY_KEYS, null], message: "عائلة غير صالحة" } },
    },
    starts_at: { type: Date },
    ends_at: { type: Date },
    active: { type: Boolean, default: true },
    sort: { type: Number, default: 0 },
  },
  { timestamps: true }
);

placementSchema.pre("validate", function (next) {
  if (this.starts_at && this.ends_at && !(this.ends_at > this.starts_at)) {
    this.invalidate("ends_at", "تاريخ الانتهاء يجب أن يكون بعد البداية");
  }
  next();
});

export default mongoose.model("placements", placementSchema);
