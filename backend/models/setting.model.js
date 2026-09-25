import mongoose from "mongoose";

const settingSchema = new mongoose.Schema(
  {
    _id: { type: String, default: "shop" },
    whatsapp: { type: String, trim: true, match: [/^(\d{8,15})?$/, "رقم واتساب غير صالح"], default: "" },
    instagram: { type: String, trim: true, match: [/^(https:\/\/[^\s"'<>]+)?$/, "رابط انستغرام غير صالح"], default: "" },
    delivery_fee: { type: Number, min: 0, default: 0 },
    free_delivery_over: { type: Number, min: 0, default: 0 },
  },
  { timestamps: true }
);

export default mongoose.model("Setting", settingSchema);
