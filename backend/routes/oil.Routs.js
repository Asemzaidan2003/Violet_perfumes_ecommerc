import express from "express";
import { createOil , updateOil }  from "../controller/oilController.js";

const router = express.Router();

router.post("/", createOil);   
// router.get("/", getProducts);      
// router.get("/:id", getProductById); 
router.put("/:id", updateOil);  
// router.delete("/:id", deleteProduct); 

export default router;
