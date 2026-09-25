import mongoose from "mongoose";

const bottleSchema = new mongoose.Schema({
    name: {
    type: String,
    required: true,
    trim: true,
    },
    capacity: {
        type: Number,
        required: true,
        min: 0,
    },
    cost: {
        type: Number,
        required: true,
        min: 0,
    },
    quantity: {
        type: Number,
        required: true,
    }
});

const Bottle = mongoose.model("Bottle", bottleSchema);

export default Bottle;
