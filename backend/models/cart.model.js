import mongoose from "mongoose";

const cartSchema = new mongoose.Schema({
    user_id: {
        type: mongoose.Schema.Types.ObjectId,
        required: true,
        ref: "users"
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
            product_price: {
                type: Number,
                required: true
            },
            product_quantity: {
                type: Number,
                required: true
            },
            total_price: {
                type: Number,
                required: true
            }
        }
    ],
    total_items: {
        type: Number,
        required: true
    },
    total_price: {
        type: Number,
        required: true
    }
}, { timestamps: true });

const Cart = mongoose.model("carts", cartSchema);
export default Cart;

/*
{
  "_id": ObjectId("65e5b0a1c4d2a3e4f5b67893"),
  "user_id": ObjectId("65e5a9f1a4b2c3d4e5f67891"),
  "products": [
    {
      "product_id": ObjectId("5001"),
      "product_size": "30ml",
      "product_price": 3.00,
      "product_quantity": 2
    },
    {
      "product_id": ObjectId("5003"),
      "product_size": "50ml",
      "product_price": 5.00,
      "product_quantity": 1,
      "total_price": 5.00
    }
  ],
  "total_items": 3,
  "total_price": 11.00,
  "created_at": ISODate("2025-03-04T12:00:00Z"),
  "updated_at": ISODate("2025-03-04T12:05:00Z")
}
*/