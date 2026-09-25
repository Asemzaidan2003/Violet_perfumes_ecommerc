import Order from '../models/order.model.js';

// POST Create Order
export const createOrder = async (req, res) => {
    const newOrder = new Order(req.body);
    await newOrder.save();
    res.status(201).json({ message: "Order created successfully", data: newOrder });
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

// DELETE Order
export const deleteOrder = async (req, res) => {
    const order = await Order.findByIdAndDelete(req.params.id);
    if (!order) {
        return res.status(404).json({ message: "Order not found" });
    }
    res.status(200).json({ message: "Order deleted successfully", data: order });
}

export const updateOrderStatus = async (req, res) => {
    const order = await Order.findByIdAndUpdate(
        req.params.id,
        { status: req.body.status },
        { new: true }
    );
    if (!order) {
        return res.status(404).json({ message: "Order not found" });
    }
    res.status(200).json({ message: "Order status updated successfully", data: order });
}
