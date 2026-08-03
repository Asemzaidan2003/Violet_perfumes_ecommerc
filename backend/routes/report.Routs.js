import express from "express";
import {
  getDashboardSummary,
  getSalesReport,
  getProductsReport,
  getInventoryReport,
  getCustomersReport,
} from "../controller/report.Controller.js";

const router = express.Router();

router.get("/dashboard", getDashboardSummary); // Quick-glance dashboard KPIs
router.get("/sales", getSalesReport); // Sales trend over a date range
router.get("/products", getProductsReport); // Product / category / size performance
router.get("/inventory", getInventoryReport); // Stock levels & capital tied in inventory
router.get("/customers", getCustomersReport); // Top customers & customer growth

export default router;
