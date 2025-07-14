import mongoose from "mongoose";

const bottleSchema = new mongoose.Schema({
    name: {
    type: String,
    required: true,
    },
    capacity: {
        type: Number,
        required: true,
    },
    cost: {
        type: Number,
        required: true,
    },
    quantity: {
        type: Number,
        required: true,
    }
});

const Bottle = mongoose.model("Bottle", bottleSchema);

export default Bottle;
