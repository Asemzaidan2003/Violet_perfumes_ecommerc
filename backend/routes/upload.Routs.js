import express from "express";
import { uploadImage, uploadThumb } from "../controller/upload.Controller.js";

const router = express.Router();
// Raw parser only here, and only after requireAdmin (mounted below the guard in app.js).
const raw = express.raw({ type: ["image/jpeg", "image/png", "image/webp"], limit: "3mb" });

router.post("/", raw, uploadImage);
router.post("/:id/thumb", raw, uploadThumb);

export default router;
