import express from "express";
import { createOil , updateOil , getOils ,getOilById ,deleteOil , calculateCapital}  from "../controller/oilController.js";

const router = express.Router();

router.post("/", createOil);   
router.get("/", getOils);    
router.get("/calculate_capital",calculateCapital)  
router.get("/:id", getOilById); 
router.put("/:id", updateOil);  
router.delete("/:id", deleteOil); 

export default router;
