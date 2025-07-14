import Bottle from '../models/bottle.model.js';

export const createBottle = async (req, res) => {
    try {
        const { name, capacity, cost, quantity } = req.body;
        const newBottle = new Bottle({
            name,
            capacity,
            cost,
            quantity
        });
        await newBottle.save();
        return res.status(201).json({
            success: true,
            message: "Bottle created successfully",
            data: newBottle
        });
    } catch (error) {
        return res.status(500).json({
            success: false,
            message: `Error creating bottle: ${error.message}`,
        });
    }
}

export const updateBottle = async (req, res) => {
    try {
        const { id } = req.params;
        const update = req.body;
        const updatedBottle = await Bottle.findByIdAndUpdate(id, update, { new: true });
        if (!updatedBottle) {
            return res.status(404).json({
                success: false,
                message: `No Bottle found with this ID: ${id}`,
            });
        }
        return res.status(200).json({
            success: true,
            message: "Bottle data updated successfully",
            data: updatedBottle
        });
    } catch (error) {
        return res.status(500).json({
            success: false,
            message: `Error updating bottle: ${error.message}`,
        });
    }
};

export const getBottles = async (req, res) => {
    try {
        const bottles = await Bottle.find({});
        if (bottles.length === 0) {
            return res.status(404).json({
                success: false,
                message: "No bottles found",
            });
        }
        return res.status(200).json({
            success: true,
            data: bottles
        });
    } catch (error) {
        return res.status(500).json({
            success: false,
            message: `Error fetching bottles: ${error.message}`,
        });
    }
};

export const getBottleById = async (req, res) => {
    try {
        const { id } = req.params;
        const bottle = await Bottle.findById(id);
        if (!bottle) {
            return res.status(404).json({
                success: false,
                message: `No Bottle found with this ID: ${id}`,
            });
        }
        return res.status(200).json({
            success: true,
            data: bottle
        });
    } catch (error) {
        return res.status(500).json({
            success: false,
            message: `Error fetching bottle: ${error.message}`,
        });
    }
};

export const deleteBottle = async (req, res) => {
    try {
        const { id } = req.params;
        const deletedBottle = await Bottle.findByIdAndDelete(id);
        if (!deletedBottle) {
            return res.status(404).json({
                success: false,
                message: `No Bottle found with this ID: ${id}`,
            });
        }
        return res.status(200).json({
            success: true,
            message: "Bottle deleted successfully",
        });
    } catch (error) {
        return res.status(500).json({
            success: false,
            message: `Error deleting bottle: ${error.message}`,
        });
    }
};