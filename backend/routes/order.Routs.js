import express from 'express';
import { createOrder, deleteOrder, getOrders, getOrderById , updateOrderStatus, confirmOrder } from '../controller/order.Controller.js';

const router = express.Router();

router.post('/', createOrder);
router.post('/:id/confirm', confirmOrder);
router.get('/', getOrders);
router.get('/:id', getOrderById);
router.delete('/:id', deleteOrder);
router.put('/:id', updateOrderStatus);

export default router;
