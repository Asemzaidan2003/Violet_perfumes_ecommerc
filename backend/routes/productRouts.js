import express from "express";
import { createProduct , deleteProduct , getProducts , getProductById , updateProduct} from "../controller/productController.js";

const router = express.Router();

router.post("/", createProduct);   // Create Product
router.get("/", getProducts);      // Get All Products
router.get("/:id", getProductById); // Get Single Product
router.put("/:id", updateProduct);  // Update Product
router.delete("/:id", deleteProduct); // Delete Product

export default router;
