import mongoose from "mongoose";

const productSchema = new mongoose.Schema({
    p_name: {
        type: String,
        required: true,
        unique: true
    },
    p_image: {
        type: String,
        required: true
    },
    size_list: {
        type: [
            {
                size: { type: String, required: true },
                price: { type: Number, required: true }
            }
        ],
        validate: [arrayLimit, "At least one size is required"]
    },
    p_category: {
        type: String,
        required: true
    },
    p_offer_percentage: {
        type: Number,
        default: 0
    },
    oil_id: {
        type: String,
        ref: "oils",
        required: true
    },
    status: {
        type: String,
        enum: ["available", "out of stock", "discontinued"],
        default: "available"
    }
}, { timestamps: true });

function arrayLimit(val) {
    return val.length > 0;
}

const Product = mongoose.model("products", productSchema);
export default Product;
