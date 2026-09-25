import mongoose from "mongoose";
import { CATEGORY_KEYS, FAMILY_KEYS } from "../../storefront/js/shared/vocab.js";

// "30ml", " 50 مل " → "30", "50" (so the storefront and stock rules see one spelling).
const normalizeSize = (v) => String(v ?? "").trim().replace(/\s*(ml|مل)\s*$/i, "").trim();
const note = { type: String, trim: true, maxlength: 40 };
const noteList = {
  type: [note],
  validate: { validator: (v) => v.length <= 10, message: "عشر نوتات كحد أقصى لكل طبقة" },
};
const IMAGE_URL = /^(\/img\/[a-f0-9]{24}(-480)?\.(webp|jpg|png)|https:\/\/\S+)$/;

const productSchema = new mongoose.Schema(
  {
    p_name: { type: String, required: true, unique: true, trim: true },
    p_image: { type: String, required: true },
    p_category: { type: String, required: true, enum: CATEGORY_KEYS },
    p_offer_percentage: { type: Number, default: 0, min: 0, max: 100 },

    oil_id: {
      type: String,
      required: true,
    },

    size_list: [
      {
        size: {
          type: String,
          required: true,
          set: normalizeSize,
          validate: { validator: (v) => /^\d+(\.\d+)?$/.test(v) && Number(v) > 0, message: "الحجم يجب أن يكون رقمًا موجبًا" },
        }, // مثال: "30ml" → "30"
        price: { type: Number, required: true, min: 0 }, // سعر البيع
        //cost: { type: Number, required: true }, // تكلفة الإنتاج اليدوية
      },
    ],
    oil_percentage: {
      type: Number,
      required: true,
      min: 0,
      max: 100,
    },
    alcohol_percentage: {
      type: Number,
      required: true,
      min: 0,
      max: 100,
    },
    status: {
      type: String,
      enum: ["available", "out of stock", "discontinued"],
      default: "available",
    },
    description: { type: String, trim: true, maxlength: 2000 },
    families: [{ type: String, enum: FAMILY_KEYS }],
    notes: { top: noteList, heart: noteList, base: noteList },
    images: [{ type: String, validate: { validator: (v) => IMAGE_URL.test(v), message: "رابط صورة غير صالح" } }],
    keywords: { type: String, trim: true, maxlength: 300 },
  },
  { timestamps: true }
);

export default mongoose.model("products", productSchema);
