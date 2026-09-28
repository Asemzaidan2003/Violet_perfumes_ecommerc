import express from "express";
import { listPlacements, createPlacement, updatePlacement, deletePlacement } from "../controller/promotions.Controller.js";

const router = express.Router();

router.get("/placements", listPlacements);
router.post("/placements", createPlacement);
router.put("/placements/:id", updatePlacement);
router.delete("/placements/:id", deletePlacement);

export default router;
