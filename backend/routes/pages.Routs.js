import express from "express";
import { listPages, createPage, updatePage, deletePage, previewPage } from "../controller/pages.Controller.js";

const router = express.Router();

router.get("/pages", listPages);
router.post("/pages", createPage);
router.post("/pages/preview", previewPage);
router.put("/pages/:id", updatePage);
router.delete("/pages/:id", deletePage);

export default router;
