import express from "express";
import { listCategories, createCategory, updateCategory, deleteCategory } from "../controller/categories.Controller.js";

const router = express.Router();

router.get("/categories", listCategories);
router.post("/categories", createCategory);
router.put("/categories/:id", updateCategory);
router.delete("/categories/:id", deleteCategory);

export default router;
