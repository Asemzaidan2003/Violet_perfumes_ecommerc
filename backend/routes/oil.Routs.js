import express from "express";
import { createOil , updateOil , getOils ,getOilById ,deleteOil , calculateOilCapital}  from "../controller/oil.Controller.js";

const router = express.Router();

router.post("/", createOil);   
router.get("/", getOils);    
router.get("/calculate_oil_capital",calculateOilCapital)  
router.get("/:id", getOilById); 
router.put("/:id", updateOil);  
router.delete("/:id", deleteOil); 

export default router;
