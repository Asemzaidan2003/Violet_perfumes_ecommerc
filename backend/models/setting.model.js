import mongoose from "mongoose";

// Strict 6-digit hex only — these values are interpolated straight into a <style> block server-side.
const HEX = { type: String, trim: true, match: [/^(#[0-9a-fA-F]{6})?$/, "لون غير صالح، يجب أن يكون رمز hex من 6 خانات"], default: "" };

const settingSchema = new mongoose.Schema(
  {
    _id: { type: String, default: "shop" },
    whatsapp: { type: String, trim: true, match: [/^(\d{8,15})?$/, "رقم واتساب غير صالح"], default: "" },
    instagram: { type: String, trim: true, match: [/^(https:\/\/[^\s"'<>]+)?$/, "رابط انستغرام غير صالح"], default: "" },
    delivery_fee: { type: Number, min: 0, default: 0 },
    free_delivery_over: { type: Number, min: 0, default: 0 },
    theme: {
      type: new mongoose.Schema({ bg: HEX, surface: HEX, text: HEX, accent: HEX }, { _id: false }),
      default: () => ({}),
    },
  },
  { timestamps: true }
);

export default mongoose.model("Setting", settingSchema);
