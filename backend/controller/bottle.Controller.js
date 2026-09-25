import Bottle from '../models/bottle.model.js';
import { stockUpdate } from '../utils/restock.js';

export const createBottle = async (req, res) => {
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
}

export const updateBottle = async (req, res) => {
    const { id } = req.params;
    const update = stockUpdate(req.body, "quantity");
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
};

export const getBottles = async (req, res) => {
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
};

export const getBottleById = async (req, res) => {
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
};

export const deleteBottle = async (req, res) => {
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
};

export const calculateBottleCapital = async (req, res) => {
  const bottleData = await Bottle.find({});

  if (bottleData.length === 0) {
    return res.status(404).json({
      success: false,
      message: "No data found",
      data: null,
    });
  }

  const totalQuantity = bottleData.reduce(
    (sum, bottle) => sum + Math.max(0, bottle.quantity),
    0
  );
  const totalCapital = bottleData.reduce(
    (sum, bottle) => sum + Math.max(0, bottle.quantity) * bottle.cost,
    0
  );

  res.status(200).json({
    success: true,
    message: "Capital calculated successfully",
    data: {
      quantity: totalQuantity,
      capital: totalCapital,
    },
  });
};
