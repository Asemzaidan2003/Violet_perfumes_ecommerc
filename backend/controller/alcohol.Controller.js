import Alcohol from "../models/alcohol.model.js";

export const addAlcohol = async (req, res) => {
  try {
    const alcohol = new Alcohol(req.body);
    await alcohol.save();
    res.status(201).json(alcohol);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

export const getAlcohol = async (req, res) => {
  try {
    const alcohols = await Alcohol.find();
    res.status(200).json(alcohols);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const updateAlcohol = async (req, res) => {
  try {
    const alcohol = await Alcohol.findByIdAndUpdate(req.params.id, req.body, { new: true });
    if (!alcohol) {
      return res.status(404).json({ message: "Alcohol not found" });
    }
    res.status(200).json(alcohol);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};
