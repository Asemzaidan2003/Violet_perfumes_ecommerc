import express from "express";
import { login, logout, me } from "../controller/auth.Controller.js";
import { requireAdmin } from "../middleware/auth.js";

const router = express.Router();

router.post("/login", login);
router.post("/logout", logout);
router.get("/me", requireAdmin, me);

export default router;
