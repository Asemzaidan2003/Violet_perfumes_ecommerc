import express from "express";
import {
  listPlacements, createPlacement, updatePlacement, deletePlacement,
  listCoupons, createCoupon, updateCoupon, deleteCoupon,
} from "../controller/promotions.Controller.js";

const router = express.Router();

router.get("/placements", listPlacements);
router.post("/placements", createPlacement);
router.put("/placements/:id", updatePlacement);
router.delete("/placements/:id", deletePlacement);
router.get("/coupons", listCoupons);
router.post("/coupons", createCoupon);
router.put("/coupons/:id", updateCoupon);
router.delete("/coupons/:id", deleteCoupon);

export default router;
