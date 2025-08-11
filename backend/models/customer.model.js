import mongoose from "mongoose";

const customerSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
    },
    phone: String,
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
