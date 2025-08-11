import express from "express";
import {
  getBottleById,
  getBottles,
  createBottle,
  updateBottle,
  deleteBottle,
  calculateBottleCapital,
} from "../controller/bottle.Controller.js";

const router = express.Router();
// Route to get all bottles
router.get("/calculate_bottle_capital", calculateBottleCapital); // Route to calculate total capital
router.get("/", getBottles);
router.get("/:id", getBottleById); // Route to get a specific bottle by ID
router.post("/", createBottle); // Route to create a new bottle
router.put("/:id", updateBottle); // Route to update a specific bottle by ID
router.delete("/:id", deleteBottle); // Route to delete a specific bottle by ID


export default router; // Export the router to be used in the main app
