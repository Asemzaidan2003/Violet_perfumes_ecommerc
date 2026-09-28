import express from "express";
import { listBrands, createBrand, updateBrand, deleteBrand } from "../controller/brands.Controller.js";

const router = express.Router();

router.get("/brands", listBrands);
router.post("/brands", createBrand);
router.put("/brands/:id", updateBrand);
router.delete("/brands/:id", deleteBrand);

export default router;
