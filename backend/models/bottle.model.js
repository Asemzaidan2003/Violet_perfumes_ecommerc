import mongoose from "mongoose";

const bottleSchema = new mongoose.Schema({
    b_size: {
        type: String,
        required: true
    },
    b_quantity: {
        type: Number,
        required: true
    },
    b_cost: {
        type: Number,
        required: true
    },
    status: {
        type: String,
        enum: ["available", "out of stock"],
        required: false
    }
}, { timestamps: true });

const Bottle = mongoose.model("bottles", bottleSchema);
export default Bottle;


/*
{
  "_id": ObjectId("bottle_id"),
  "b_size": "50ml",
  "b_quantity": 200,
  "b_cost": 2.00,
  "status": "available",
  "created_at": ISODate("2025-03-04T12:00:00Z"),
  "updated_at": ISODate("2025-03-04T12:05:00Z")
}
*/