import Customer from "../models/customer.model.js";
import { normalizePhone } from "../../storefront/js/shared/phone.js";

export const getAllCustomers = async (req, res) => {
  const customers = await Customer.find().sort({ createdAt: -1 });
  res.json(customers);
};

export const getCustomerById = async (req, res) => {
  const customer = await Customer.findById(req.params.id);
  if (!customer)
    return res.status(404).json({ message: "Customer not found" });
  res.json(customer);
};

// Normalized the same way as the storefront's delivery snapshot, so an online order's
// confirm-time phone lookup (see order.service.js) finds a customer created here too.
const withNormalizedPhone = (body) =>
  body?.phone != null ? { ...body, phone: normalizePhone(body.phone) } : body;

export const addCustomer = async (req, res) => {
  const customer = new Customer(withNormalizedPhone(req.body));
  await customer.save();
  res.status(201).json(customer);
};

export const updateCustomer = async (req, res) => {
  const updated = await Customer.findByIdAndUpdate(req.params.id, withNormalizedPhone(req.body), {
    new: true,
  });
  if (!updated)
    return res.status(404).json({ message: "Customer not found" });
  res.json(updated);
};

export const deleteCustomer = async (req, res) => {
  const deleted = await Customer.findByIdAndDelete(req.params.id);
  if (!deleted)
    return res.status(404).json({ message: "Customer not found" });
  res.json({ message: "Customer deleted successfully" });
};

export const getCustomerByPhone = async (req, res) => {
  const phone = normalizePhone(req.params.phone);
  const customer = await Customer.findOne({ phone });
  if (!customer) {
    return res.status(200).json({ message: "الزبون غير موجود" , customer: {_id:null} });
  }
  res.json({ customer });
};
