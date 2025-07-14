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
        p_name: { type: String, required: true }, // اسم المنتج وقت الطلب
        product_size: { type: String, required: true }, // الحجم المختار
        quantity: { type: Number, required: true, min: 1 },

        selling_price: { type: Number, required: true }, // السعر وقت الطلب
        cost_price: { type: Number, required: true }, // الكلفة وقت الطلب

        total_revenue: { type: Number, required: true }, // = السعر * الكمية
        total_cost: { type: Number, required: true }, // = الكلفة * الكمية
        total_profit: { type: Number, required: true }, // = revenue - cost
      },
    ],

    total_items: { type: Number, required: true },
    total_revenue: { type: Number, required: true },
    total_cost: { type: Number, required: true },
    total_profit: { type: Number, required: true },

    payment_method: { type: String, enum: ["Cash", "Credit"], required: true },
    delivery_fee: { type: Number, default: 0 },
    final_total: { type: Number, required: true }, // total_revenue + delivery_fee

    order_notes: { type: String, default: "" },

    status: {
      type: String,
      enum: ["pending", "completed", "canceled"],
      default: "pending",
    },

    created_by: { type: String, default: "admin" }, // أو بتربطه بمستخدم لاحقًا
  },
  { timestamps: true }
);

export default mongoose.model("orders", orderSchema);

// Example document structure:
// {
//   products: [
//     {
//       product_id: "60c72b2f9b1e8c001f8b4567",
//       p_name: "Product Name",
//       product_size: "Large",
//       quantity: 2,
//       selling_price: 100,
//       cost_price: 80,
//       total_revenue: 200,
//       total_cost: 160,
//       total_profit: 40
//     }
//   ],
//   total_items: 2,
//   total_revenue: 200,
//   total_cost: 160,
//   total_profit: 40,
//   payment_method: "Cash",
//   delivery_fee: 10,
//   final_total: 210,
//   order_notes: "Please deliver by 5 PM",
//   status: "pending",
//   created_by: "admin"
// }
