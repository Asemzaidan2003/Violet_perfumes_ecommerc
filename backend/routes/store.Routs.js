import express from "express";
import { getPublicCatalog } from "../controller/store.Controller.js";

const router = express.Router();

router.get("/catalog", getPublicCatalog);

export default router;
