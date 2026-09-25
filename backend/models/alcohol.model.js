import mongoose from "mongoose";

const alcoholSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    type: { type: String, required: true, trim: true },
    quantity: { type: Number, required: true, min: 0 },
    cost: { type: Number, required: true, min: 0 },
  },
  {
    timestamps: true,
  }
);

const Alcohol = mongoose.model("Alcohol", alcoholSchema);

export default Alcohol;
