import mongoose from "mongoose";

const customerSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    phone: { type: String, trim: true },
    address: String,
    notes: String,
    type: {
      type: String,
      enum: ["individual", "store"],
      default: "individual",
    },
  },
  { timestamps: true }
);

export default mongoose.model("Customer", customerSchema);
