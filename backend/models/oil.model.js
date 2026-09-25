import mongoose from "mongoose";
//dont forget to add a catigory for oils and gender
const oilSchema = new mongoose.Schema({
    id: {
        type:String,
        required: true,
        unique: true
    },
    oil_name: {
        type: String,
        required: true,
        trim: true
    },
    oil_cost: {
        type: Number,
        required: true,
        min: 0
    },
    oil_quantity: {
        type: Number,
        required: true,
        min: 0
    },
    status: {
        type: String,
        enum: ["available", "out of stock", "discontinued"],
        default: "available"
    }
}, { timestamps: true });

const Oil = mongoose.model("oils", oilSchema);
export default Oil;


/*
{
  "_id": ObjectId("oil_id"),
  "oil_name": "Oil Name",
  "oil_cost": 5.00,
  "oil_quantity": 50,
  "status": "available",
  "created_at": ISODate("2025-03-04T12:00:00Z"),
  "updated_at": ISODate("2025-03-04T12:05:00Z")
}
*/