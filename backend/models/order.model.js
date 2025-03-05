import mongoose from "mongoose";

const orderSchema = new mongoose.Schema({
    _id: {
        type: mongoose.Schema.Types.ObjectId,
        required: true
    },
    user_id: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "users",
        required: true
    },
    products: [
        {
            product_id: {
                type: mongoose.Schema.Types.ObjectId,
                ref: "products", 
                required: true
            },
            product_size: {
                type: String,
                required: true
            },
            quantity: {
                type: Number,
                required: true,
                min: 1
            },
            cost_price: {
                type: Number,
                required: true
            },
            selling_price: {
                type: Number,
                required: true
            },
            total_cost: {
                type: Number,
                required: true
            },
            total_revenue: {
                type: Number,
                required: true
            },
            profit_per_item: {
                type: Number,
                required: true
            },
            total_profit: {
                type: Number,
                required: true
            }
        }
    ],
    total_cost: {
        type: Number,
        required: true
    },
    total_revenue: {
        type: Number,
        required: true
    },
    total_profit: {
        type: Number,
        required: true
    },
    payment_method: {
        type: String,
        enum: ["Credit Card", "Cash on Delivery"], // Restrict payment methods
        required: true
    },
    shipping_method: {
        type: String,
        required: true
    },
    delivery_fee: {
        type: Number,
        required: true
    },
    final_total: {
        type: Number,
        required: true
    },
    order_notes: {
        type: String,
        default: ""
    },
    status: {
        type: String,
        enum: ["pending", "processing", "shipped", "delivered", "canceled"],
        default: "pending"
    },
    tracking: [
        {
            status: {
                type: String,
                enum: ["pending", "processing", "shipped", "delivered"],
                required: true
            }
        }
    ]
}, { timestamps: true });

const Order = mongoose.model("orders", orderSchema);

export default Order;
