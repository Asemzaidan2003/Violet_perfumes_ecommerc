import express from "express";
import {createOil}  from "../controller/oilController.js";

const router = express.Router();

router.post("/", createOil);   
// router.get("/", getProducts);      
// router.get("/:id", getProductById); 
// router.put("/:id", updateProduct);  
// router.delete("/:id", deleteProduct); 

export default router;
