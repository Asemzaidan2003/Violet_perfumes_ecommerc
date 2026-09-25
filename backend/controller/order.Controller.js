import Order from '../models/order.model.js';
import { placeOrder, confirmOrder as confirm, changeStatus, removeOrder } from '../services/order.service.js';

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
    res.status(200).json({ message: "Order deleted successfully", data: order });
}

export const updateOrderStatus = async (req, res) => {
    const order = await changeStatus(req.params.id, req.body.status);
    res.status(200).json({ message: "Order status updated successfully", data: order });
}

// POST Confirm an online order from the POS: pick bottles, deduct stock
export const confirmOrder = async (req, res) => {
    const { order, shortages } = await confirm(req.params.id, req.body.lines);
    res.status(200).json({ message: "Order confirmed", data: order, shortages });
}
