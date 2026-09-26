import express from "express";
import {
  getPublicCatalog, createStoreOrder, createStoreInterest, waLimitMessage, warmSettings,
} from "../controller/store.Controller.js";
import { limit } from "../middleware/rateLimit.js";

const router = express.Router();

router.get("/catalog", getPublicCatalog);
router.post("/orders", warmSettings, limit("orders", waLimitMessage("طلبات كثيرة من نفس الجهاز")), createStoreOrder);
router.post("/interest", warmSettings, limit("interest", waLimitMessage("طلبات كثيرة من نفس الجهاز")), createStoreInterest);

export default router;
