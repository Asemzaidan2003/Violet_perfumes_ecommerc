import mongoose from "mongoose";
import { IMAGE_URL } from "./product.model.js";

const SLUG_RE = /^[a-z0-9-]{2,40}$/;

// name_en, lowercased and dashed, as the default slug: "Dior" -> "dior", "Yves Saint Laurent" -> "yves-saint-laurent".
export const slugify = (s) => String(s ?? "").trim().toLowerCase()
  .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40);

const brandSchema = new mongoose.Schema(
  {
    name_ar: { type: String, required: true, trim: true, maxlength: 60 },
    name_en: { type: String, required: true, trim: true, maxlength: 60 },
    slug: { type: String, required: true, unique: true, match: [SLUG_RE, "رابط غير صالح"] },
    logo: { type: String, validate: { validator: (v) => !v || IMAGE_URL.test(v), message: "رابط صورة غير صالح" } },
    active: { type: Boolean, default: true },
  },
  { timestamps: true }
);

brandSchema.pre("validate", function preValidate() {
  if (!this.slug || !this.slug.trim()) this.slug = slugify(this.name_en);
});

export default mongoose.model("brands", brandSchema);
