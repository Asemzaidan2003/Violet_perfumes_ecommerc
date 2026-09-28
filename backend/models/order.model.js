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
        cost_price: { type: Number, default: 0 },

        total_revenue: { type: Number, required: true },
        total_cost: { type: Number, default: 0 },
        total_profit: { type: Number, default: 0 },
        bottle: {
          bottle_id: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "bottles",
          },
          name: { type: String },
          cost: { type: Number },
        },

        // What the line needs, and what was actually taken at confirmation
        // (less than needed when stock ran short) so a refund returns exactly that.
        oil_id: { type: String },
        oil_ml: { type: Number },
        alcohol_ml: { type: Number },
        stock: {
          oil_ml: Number,
          alcohol_ml: Number,
          oil_doc_id: { type: mongoose.Schema.Types.ObjectId },
          alcohol_id: { type: mongoose.Schema.Types.ObjectId },
          bottles: Number,
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
    // Discount-code snapshot, taken at placement (online only). `discount` is derived from it
    // by setTotals, so an edit at confirmation re-derives it from the edited revenue.
    discount: { type: Number, default: 0 },
    coupon: { id: mongoose.Schema.Types.ObjectId, code: String, type: { type: String }, value: Number },

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

    source: { type: String, enum: ["pos", "online"], default: "pos" },
    // Legacy orders were deducted in the browser at creation, so the default
    // `true` makes them read as confirmed without a migration.
    stock_deducted: { type: Boolean, default: true },

    // Online orders only: public tracking ref, idempotency key, and a snapshot of the
    // delivery details as submitted (the phone is unverified — no customer record yet).
    public_ref: { type: String, unique: true, sparse: true },
    client_key: { type: String, unique: true, sparse: true },
    delivery: {
      name: String,
      phone: String,
      city: String,
      address: String,
      notes: String,
    },
  },
  { timestamps: true }
);

// Reporting queries filter/group heavily by these fields (date-range trends,
// status breakdowns, per-customer aggregates), so index them for performance.
orderSchema.index({ createdAt: -1 });
orderSchema.index({ status: 1, createdAt: -1 });
orderSchema.index({ customer_id: 1 });

export default mongoose.model("orders", orderSchema);
