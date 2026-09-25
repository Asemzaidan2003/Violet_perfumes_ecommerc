import express from "express";
import Image from "../models/image.model.js";
import { EXT } from "../controller/upload.Controller.js";

const router = express.Router();
const FILE = /^([a-f0-9]{24})(-480)?\.(webp|jpg|png)$/;

// Public: ids are never reused, so responses are cacheable forever.
router.get("/:file", async (req, res) => {
  const m = FILE.exec(req.params.file);
  if (!m) return res.status(404).end();
  const img = await Image.findById(m[1]);
  if (!img || EXT[img.type] !== m[3]) return res.status(404).end();
  const useThumb = Boolean(m[2] && img.thumb);
  res.set("Cache-Control", "public, max-age=31536000, immutable");
  res.type(useThumb ? img.thumb_type : img.type).send(useThumb ? img.thumb : img.full);
});

export default router;
