import mongoose from "mongoose";
import { CATEGORY_KEYS, FAMILY_KEYS, normalizeSize } from "../../storefront/js/shared/vocab.js";

const note = { type: String, trim: true, maxlength: 40 };
const noteList = {
  type: [note],
  validate: { validator: (v) => v.length <= 10, message: "عشر نوتات كحد أقصى لكل طبقة" },
};
const IMAGE_URL = /^(\/img\/[a-f0-9]{24}(-480)?\.(webp|jpg|png)|https:\/\/[^\s"'<>]+)$/;

const productSchema = new mongoose.Schema(
  {
    p_name: { type: String, required: true, unique: true, trim: true },
    p_image: { type: String, required: true },
    p_category: { type: String, required: true, enum: { values: CATEGORY_KEYS, message: "فئة غير صالحة" } },
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
    families: [{ type: String, enum: { values: FAMILY_KEYS, message: "عائلة عطرية غير صالحة" } }],
    notes: { top: noteList, heart: noteList, base: noteList },
    images: [{ type: String, validate: { validator: (v) => IMAGE_URL.test(v), message: "رابط صورة غير صالح" } }],
    keywords: { type: String, trim: true, maxlength: 300 },
  },
  { timestamps: true }
);

export default mongoose.model("products", productSchema);
