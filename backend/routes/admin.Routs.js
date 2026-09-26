import express from "express";
import { getShopSettings, updateShopSettings, getInterests, updateInterestStatus } from "../controller/admin.Controller.js";

const router = express.Router();

router.get("/settings", getShopSettings);
router.put("/settings", updateShopSettings);
router.get("/interests", getInterests);
router.put("/interests/:id", updateInterestStatus);

export default router;
