import express from "express";
import { getShopSettings, updateShopSettings } from "../controller/admin.Controller.js";

const router = express.Router();

router.get("/", getShopSettings);
router.put("/", updateShopSettings);

export default router;
