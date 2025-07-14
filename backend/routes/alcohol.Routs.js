import express from 'express';
import {
  getAlcohol,
  addAlcohol,
  updateAlcohol,
} from "../controller/alcohol.Controller.js";
const router = express.Router();

router.get('/', getAlcohol);
router.post('/', addAlcohol);
router.put('/', updateAlcohol);

export default router;