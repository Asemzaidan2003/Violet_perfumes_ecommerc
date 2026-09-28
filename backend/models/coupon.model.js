import mongoose from "mongoose";

export const CODE_RE = /^[A-Z0-9_-]{3,20}$/;

const couponSchema = new mongoose.Schema(
  {
    code: {
      type: String, required: [true, "الكود مطلوب"], unique: true, trim: true, uppercase: true,
      match: [CODE_RE, "الكود يجب أن يكون من 3 إلى 20 حرفًا إنجليزيًا أو رقمًا"],
    },
    type: { type: String, required: [true, "نوع الخصم مطلوب"], enum: { values: ["percent", "fixed"], message: "نوع الخصم غير صالح" } },
    value: {
      type: Number,
      required: [true, "قيمة الخصم مطلوبة"],
      validate: {
        // `this` is the document on save; on query updates the type isn't at hand, so the
        // controller edits by load-and-save to keep the percent ≤ 100 rule on edits too.
        validator(v) { return Number.isFinite(v) && v > 0 && (this.type !== "percent" || v <= 100); },
        message: "قيمة الخصم يجب أن تكون أكبر من صفر، ولا تتجاوز 100 للنسبة المئوية",
      },
    },
    min_subtotal: {
      type: Number, default: 0,
      validate: { validator: (v) => Number.isFinite(v) && v >= 0, message: "الحد الأدنى للطلب غير صالح" },
    },
    starts_at: { type: Date },
    ends_at: { type: Date },
    max_uses: {
      type: Number, default: 0, // 0 = unlimited
      validate: { validator: (v) => Number.isSafeInteger(v) && v >= 0, message: "عدد الاستخدامات غير صالح" },
    },
    used: { type: Number, default: 0 },
    active: { type: Boolean, default: true },
  },
  { timestamps: true }
);

couponSchema.pre("validate", function (next) {
  if (this.starts_at && this.ends_at && !(this.ends_at > this.starts_at)) {
    this.invalidate("ends_at", "تاريخ الانتهاء يجب أن يكون بعد البداية");
  }
  next();
});

export default mongoose.model("coupons", couponSchema);
