import mongoose from "mongoose";

// Uploaded images live in MongoDB (backed up with the data; managed hosts wipe local disks).
const TYPES = ["image/webp", "image/jpeg", "image/png"];
const imageSchema = new mongoose.Schema(
  {
    type: { type: String, enum: TYPES, required: true },
    full: { type: Buffer, required: true },
    thumb: Buffer,
    thumb_type: { type: String, enum: TYPES },
    bytes: Number,
  },
  { timestamps: true }
);

export default mongoose.model("Image", imageSchema);
