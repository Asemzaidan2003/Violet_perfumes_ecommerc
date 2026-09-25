import Customer from "../models/customer.model.js";

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

export const addCustomer = async (req, res) => {
  const customer = new Customer(req.body);
  await customer.save();
  res.status(201).json(customer);
};

export const updateCustomer = async (req, res) => {
  const updated = await Customer.findByIdAndUpdate(req.params.id, req.body, {
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
  const phone = req.params.phone;
  const customer = await Customer.findOne({ phone });
  if (!customer) {
    return res.status(200).json({ message: "الزبون غير موجود" , customer: {_id:null} });
  }
  res.json({ customer });
};
