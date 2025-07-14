import mongoose from "mongoose";

const cartSchema = new mongoose.Schema(
  {
    products: [
      {
        product_id: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "products",
          required: true,
        },
        product_size: {
          type: String,
          required: true,
        },
        product_price: {
          type: Number,
          required: true,
        },
        product_quantity: {
          type: Number,
          required: true,
        },
        total_price: {
          type: Number,
          required: true,
        },
      },
    ],
    total_items: {
      type: Number,
      required: true,
    },
    total_price: {
      type: Number,
      required: true,
    },
  },
  { timestamps: true }
);

export default mongoose.model("carts", cartSchema);
