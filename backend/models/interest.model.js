import mongoose from "mongoose";

const interestSchema = new mongoose.Schema(
  {
    product_id: { type: mongoose.Schema.Types.ObjectId, ref: "products", required: true },
    product_name: { type: String }, // snapshot, in case the product is later renamed/removed
    size: { type: String, default: null },
    name: { type: String, required: true },
    phone: { type: String, required: true },
    note: { type: String, default: "" },
    status: { type: String, enum: ["new", "contacted", "closed"], default: "new" },
  },
  { timestamps: true }
);

// Admin list is filtered by status, newest first.
interestSchema.index({ status: 1, createdAt: -1 });

export default mongoose.model("Interest", interestSchema);
