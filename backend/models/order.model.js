import mongoose from "mongoose";

const orderSchema = new mongoose.Schema(
  {
    products: [
      {
        product_id: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "products",
          required: true,
        },
        p_name: { type: String, required: true },
        product_size: { type: String, required: true },
        quantity: { type: Number, required: true, min: 1 },

        selling_price: { type: Number, required: true },
        cost_price: { type: Number, required: true },

        total_revenue: { type: Number, required: true },
        total_cost: { type: Number, required: true },
        total_profit: { type: Number, required: true },
        bottle: {
          bottle_id: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "bottles",
            required: true,
          },
          name: { type: String, required: true },
          cost: { type: Number, required: true },
        },
      },
    ],

    total_items: { type: Number, required: true },
    total_revenue: { type: Number, required: true },
    total_cost: { type: Number, required: true },
    total_profit: { type: Number, required: true },

    payment_method: { type: String, enum: ["Cash", "Credit"], required: true },
    delivery_fee: { type: Number, default: 0 },
    final_total: { type: Number, required: true },

    order_notes: { type: String, default: "" },

    status: {
      type: String,
      enum: ["pending", "completed", "canceled" , "ready for delivery" , "in delivery" , "uncollected payment"],
      default: "pending",
    },

    customer_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Customer",
      required: false,
    },

    created_by: { type: String, default: "admin" },
  },
  { timestamps: true }
);

export default mongoose.model("orders", orderSchema);
