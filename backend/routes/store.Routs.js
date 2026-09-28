import express from "express";
import {
  getPublicCatalog, createStoreOrder, createStoreInterest, checkStoreCoupon, waLimitMessage, warmSettings,
} from "../controller/store.Controller.js";
import { limit } from "../middleware/rateLimit.js";

const router = express.Router();

router.get("/catalog", getPublicCatalog);
router.post("/orders", warmSettings, limit("orders", waLimitMessage("طلبات كثيرة من نفس الجهاز")), createStoreOrder);
router.post("/coupons/check", warmSettings, limit("coupons", waLimitMessage("محاولات كثيرة من نفس الجهاز")), checkStoreCoupon);
router.post("/interest", warmSettings, limit("interest", waLimitMessage("طلبات كثيرة من نفس الجهاز")), createStoreInterest);

export default router;
