import mongoose from "mongoose";

const alcoholSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    type: { type: String, required: true },
    quantity: { type: Number, required: true },
    cost: { type: Number, required: true },
  },
  {
    timestamps: true,
  }
);

const Alcohol = mongoose.model("Alcohol", alcoholSchema);

export default Alcohol;
