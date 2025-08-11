import express from "express";
import {
  getAllCustomers,
  getCustomerById,
  addCustomer,
  updateCustomer,
  deleteCustomer,
  getCustomerByPhone,
} from "../controller/customer.controller.js";

const router = express.Router();

router.get("/", getAllCustomers); // جلب جميع الزبائن
router.get("/phone/:phone", getCustomerByPhone);
router.get("/:id", getCustomerById); // جلب زبون معين
router.post("/", addCustomer); // إضافة زبون جديد
router.put("/:id", updateCustomer); // تعديل زبون
router.delete("/:id", deleteCustomer); // حذف زبون



export default router;
