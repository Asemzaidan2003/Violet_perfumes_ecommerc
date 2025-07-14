
import express from "express";
import {
  addToCart,
  getCart,
  updateQuantity,
  removeFromCart,
  clearCart,
} from "../controllers/cart.Controller.js";

const router = express.Router();

router.post("/add", addToCart);
router.get("/", getCart);
router.put("/update", updateQuantity);
router.delete("/remove", removeFromCart);
router.delete("/clear", clearCart);

export default router;
