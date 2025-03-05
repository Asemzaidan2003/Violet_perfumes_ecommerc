import mongoose from "mongoose";

const materialSchema = new mongoose.Schema({
    m_name: {
        type: String,
        required: true
    },
    m_cost: {
        type: Number,
        required: true
    },
    m_quantity: {
        type: Number,
        required: true
    },
    status: {
        type: String,
        enum: ["available", "out of stock", "discontinued"],
        default: "available"
    }
}, { timestamps: true });

const Material = mongoose.model("materials", materialSchema);
export default Material;


/*
{
  "_id": ObjectId("material_id"),
  "m_name": "Material Name",
  "m_cost": 10.50,
  "m_quantity": 100,
  "status": "available",
  "created_at": ISODate("2025-03-04T12:00:00Z"),
  "updated_at": ISODate("2025-03-04T12:05:00Z")
}
*/