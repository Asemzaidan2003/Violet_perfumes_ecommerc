import mongoose from "mongoose";
import { IMAGE_URL } from "../store/imageUrl.js";

const KEY_RE = /^[A-Za-z][A-Za-z0-9_-]{1,30}$/;
const SLUG_RE = /^[a-z0-9-]{2,40}$/;

const categorySchema = new mongoose.Schema(
  {
    // Stored in product.p_category — immutable so existing products keep working unchanged.
    key: { type: String, required: true, unique: true, immutable: true, match: [KEY_RE, "مفتاح غير صالح"] },
    slug: { type: String, required: true, unique: true, match: [SLUG_RE, "رابط غير صالح"] },
    name_ar: { type: String, required: true, trim: true, maxlength: 40 },
    name_en: { type: String, trim: true, maxlength: 40 },
    icon: { type: String, trim: true },
    image: { type: String, validate: { validator: (v) => !v || IMAGE_URL.test(v), message: "رابط صورة غير صالح" } },
    sort: { type: Number, default: 0 },
    visible: { type: Boolean, default: true },
  },
  { timestamps: true }
);

export default mongoose.model("categories", categorySchema);
