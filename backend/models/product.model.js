import mongoose from "mongoose";

const productSchema = new mongoose.Schema(
  {
    p_name: { type: String, required: true, unique: true, trim: true },
    p_image: { type: String, required: true },
    p_category: { type: String, required: true },
    p_offer_percentage: { type: Number, default: 0, min: 0, max: 100 },

    oil_id: {
      type: String,
      required: true,
    },

    size_list: [
      {
        size: { type: String, required: true }, // مثال: "30ml"
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
  },
  { timestamps: true }
);

export default mongoose.model("products", productSchema);
