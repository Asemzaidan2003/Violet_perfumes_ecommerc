import express from 'express';
import { createOrder, deleteOrder, getOrders, getOrderById, getPendingCount, updateOrderStatus, confirmOrder } from '../controller/order.Controller.js';

const router = express.Router();

router.post('/', createOrder);
router.post('/:id/confirm', confirmOrder);
router.get('/', getOrders);
router.get('/pending-count', getPendingCount);
router.get('/:id', getOrderById);
router.delete('/:id', deleteOrder);
router.put('/:id', updateOrderStatus);

export default router;
