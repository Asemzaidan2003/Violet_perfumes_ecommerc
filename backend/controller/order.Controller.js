import Order from '../models/order.model.js';
import { placeOrder, confirmOrder as confirm, changeStatus, removeOrder } from '../services/order.service.js';
import { invalidateCatalog } from '../store/catalog.js';

// POST Create Order (POS sale: priced, costed and stock-deducted server-side)
export const createOrder = async (req, res) => {
    const { order, shortages } = await placeOrder(req.body, "pos");
    res.status(201).json({ message: "Order created successfully", data: order, shortages });
}

// GET All Orders
export const getOrders = async (req, res) => {
    const orders = await Order.find();
    res.status(200).json({ message: "Orders fetched successfully", data: orders });
}

// GET count of unconfirmed (not yet stock-deducted) orders, for the admin nav badge
export const getPendingCount = async (req, res) => {
    const count = await Order.countDocuments({ stock_deducted: false, status: { $ne: "canceled" } });
    res.status(200).json({ message: "Pending count fetched successfully", data: { count } });
}

// GET Order by ID
export const getOrderById = async (req, res) => {
    const order = await Order.findById(req.params.id);
    if (!order) {
        return res.status(404).json({ message: "Order not found" });
    }
    res.status(200).json({ message: "Order fetched successfully", data: order });
}

// DELETE Order (returns its stock unless already canceled)
export const deleteOrder = async (req, res) => {
    const order = await removeOrder(req.params.id);
    invalidateCatalog();
    res.status(200).json({ message: "Order deleted successfully", data: order });
}

export const updateOrderStatus = async (req, res) => {
    const order = await changeStatus(req.params.id, req.body.status);
    invalidateCatalog();
    res.status(200).json({ message: "Order status updated successfully", data: order });
}

// POST Confirm an online order from the POS: pick bottles, deduct stock
export const confirmOrder = async (req, res) => {
    const { order, shortages } = await confirm(req.params.id, req.body.lines, { delivery_fee: req.body.delivery_fee });
    invalidateCatalog();
    res.status(200).json({ message: "Order confirmed", data: order, shortages });
}
