import Alcohol from "../models/alcohol.model.js";

export const addAlcohol = async (req, res) => {
  const alcohol = new Alcohol(req.body);
  await alcohol.save();
  res.status(201).json(alcohol);
};

export const getAlcohol = async (req, res) => {
  const alcohols = await Alcohol.find();
  res.status(200).json(alcohols);
};

export const updateAlcohol = async (req, res) => {
  const alcohol = await Alcohol.findByIdAndUpdate(req.params.id, req.body, { new: true });
  if (!alcohol) {
    return res.status(404).json({ message: "Alcohol not found" });
  }
  res.status(200).json(alcohol);
};
