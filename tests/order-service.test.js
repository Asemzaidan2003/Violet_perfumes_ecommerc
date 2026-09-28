import { test, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import { startTestApp } from "./helpers.js";
import { placeOrder, confirmOrder, changeStatus, removeOrder } from "../backend/services/order.service.js";
import Oil from "../backend/models/oil.model.js";
import Bottle from "../backend/models/bottle.model.js";
import Alcohol from "../backend/models/alcohol.model.js";
import Product from "../backend/models/product.model.js";
import Order from "../backend/models/order.model.js";

let t, ids;
before(async () => { t = await startTestApp(); });
after(() => t.close());

// 30ml at 20% oil / 80% alcohol → per unit: 6 ml oil, 24 ml alcohol, 1 bottle.
// Per-unit cost: 6*0.5 + 24*0.02 + 1 = 4.48.
beforeEach(async () => {
  await Promise.all([Oil, Bottle, Alcohol, Product, Order].map((M) => M.deleteMany({})));
  await Oil.create({ id: "OIL1", oil_name: "Test Oil", oil_cost: 0.5, oil_quantity: 100 });
  await Alcohol.create({ name: "Ethanol", type: "perfumer", quantity: 1000, cost: 0.02 });
  const bottle = await Bottle.create({ name: "B30", capacity: 30, cost: 1, quantity: 10 });
  const bottle50 = await Bottle.create({ name: "B50", capacity: 50, cost: 2, quantity: 10 });
  const product = await Product.create({
    p_name: "Test Perfume", p_image: ".", p_category: "Men", oil_id: "OIL1",
    size_list: [{ size: "30ml", price: 20 }], oil_percentage: 20, alcohol_percentage: 80,
  });
  ids = { bottle: bottle._id.toString(), bottle50: bottle50._id.toString(), product: product._id.toString() };
});

const stock = async () => ({
  oil: (await Oil.findOne({ id: "OIL1" })).oil_quantity,
  alcohol: (await Alcohol.findOne()).quantity,
  bottle: (await Bottle.findById(ids.bottle)).quantity,
});
const line = (extra = {}) => ({ product_id: ids.product, size: "30", quantity: 2, bottle_id: ids.bottle, ...extra });

test("POS sale deducts stock and prices/costs server-side", async () => {
  const { order, shortages } = await placeOrder({ products: [line({ total_cost: 999 })] }, "pos");
  assert.deepEqual(shortages, []);
  assert.deepEqual(await stock(), { oil: 88, alcohol: 952, bottle: 8 });
  const l = order.products[0];
  assert.equal(l.selling_price, 20);
  assert.equal(l.total_revenue, 40);
  assert.equal(l.total_cost, 8.96);
  assert.equal(l.total_profit, 31.04);
  assert.equal(l.bottle.name, "B30");
  assert.equal(order.stock_deducted, true);
  assert.equal(order.source, "pos");
  assert.equal(order.total_cost, 8.96);
  assert.equal(order.final_total, 40);
});

test("POS may override price; online uses list price with offer and cannot override", async () => {
  const pos = await placeOrder({ products: [line({ price: 15 })] }, "pos");
  assert.equal(pos.order.products[0].selling_price, 15);
  await Product.updateOne({ _id: ids.product }, { p_offer_percentage: 10 });
  const online = await placeOrder({
    products: [line({ price: 1 })], delivery: {}, client_key: "key-1",
    delivery_policy: { fee: 0, free_over: 0 },
  }, "online");
  assert.equal(online.order.products[0].selling_price, 18);
  assert.equal(online.order.products[0].bottle?.bottle_id, undefined);
});

test("placeOrder rejects an invalid or missing source", async () => {
  await assert.rejects(placeOrder({ products: [line()] }), { status: 400 });
  await assert.rejects(placeOrder({ products: [line()] }, "bogus"), { status: 400 });
});

test("quantity and line-count limits are enforced", async () => {
  await assert.rejects(placeOrder({ products: [line({ quantity: 1e308 })] }, "pos"), { status: 400 });
  await assert.rejects(placeOrder({ products: [line({ quantity: 1001 })] }, "pos"), { status: 400 });
  const lines = Array.from({ length: 51 }, () => line());
  await assert.rejects(placeOrder({ products: lines }, "pos"), { status: 400 });
});

test("online order is not deducted until confirmed, and confirms once", async () => {
  const { order } = await placeOrder({
    products: [line({ bottle_id: undefined })], delivery: {}, client_key: "key-2",
    delivery_policy: { fee: 0, free_over: 0 },
  }, "online");
  assert.equal(order.stock_deducted, false);
  assert.equal(order.source, "online");
  assert.equal(order.total_cost, 0);
  assert.deepEqual(await stock(), { oil: 100, alcohol: 1000, bottle: 10 });
  await assert.rejects(changeStatus(order._id, "completed"), { status: 409 });

  const confirmed = await confirmOrder(order._id, [{ bottle_id: ids.bottle, quantity: 3 }]);
  assert.equal(confirmed.order.stock_deducted, true);
  assert.equal(confirmed.order.products[0].quantity, 3);
  assert.deepEqual(await stock(), { oil: 82, alcohol: 928, bottle: 7 });
  await assert.rejects(confirmOrder(order._id, [{ bottle_id: ids.bottle }]), { status: 409 });
  assert.equal((await changeStatus(order._id, "completed")).status, "completed");
});

test("shortage never blocks: stock goes negative (owed) and cancel restores it", async () => {
  await Oil.updateOne({ id: "OIL1" }, { oil_quantity: 5 });
  const { order, shortages } = await placeOrder({ products: [line()] }, "pos");
  assert.deepEqual(shortages, [{ item: "Test Oil", needed: 12, available: 5 }]);
  assert.equal((await stock()).oil, -7);
  await changeStatus(order._id, "canceled");
  assert.deepEqual(await stock(), { oil: 5, alcohol: 1000, bottle: 10 });
});

test("canceled order cannot be reopened; deleting a live order refunds it", async () => {
  const a = await placeOrder({ products: [line()] }, "pos");
  await changeStatus(a.order._id, "canceled");
  await assert.rejects(changeStatus(a.order._id, "pending"), { status: 409 });
  const b = await placeOrder({ products: [line()] }, "pos");
  await removeOrder(b.order._id);
  assert.deepEqual(await stock(), { oil: 100, alcohol: 1000, bottle: 10 });
  assert.equal(await Order.countDocuments(), 1);
});

test("legacy order counts as confirmed; cancelling it changes status only", async () => {
  const { insertedId } = await Order.collection.insertOne({
    products: [{
      product_id: new mongoose.Types.ObjectId(), p_name: "Old", product_size: "30ml", quantity: 1,
      selling_price: 10, cost_price: 4, total_revenue: 10, total_cost: 4, total_profit: 6,
      bottle: { bottle_id: new mongoose.Types.ObjectId(ids.bottle), name: "B30", cost: 1 },
    }],
    total_items: 1, total_revenue: 10, total_cost: 4, total_profit: 6,
    payment_method: "Cash", delivery_fee: 0, final_total: 10, status: "pending",
    createdAt: new Date(), updatedAt: new Date(),
  });
  assert.equal((await changeStatus(insertedId, "completed")).status, "completed");
  assert.equal((await changeStatus(insertedId, "canceled")).status, "canceled");
  assert.deepEqual(await stock(), { oil: 100, alcohol: 1000, bottle: 10 });
});

test("legacy order with an off-schema field can still be completed and canceled", async () => {
  const { insertedId } = await Order.collection.insertOne({
    products: [{
      product_id: new mongoose.Types.ObjectId(), p_name: "Old", product_size: "30ml", quantity: 1,
      selling_price: 10, cost_price: 4, total_revenue: 10, total_cost: 4, total_profit: 6,
      bottle: { bottle_id: new mongoose.Types.ObjectId(ids.bottle), name: "B30", cost: 1 },
    }],
    total_items: 1, total_revenue: 10, total_cost: 4, total_profit: 6,
    payment_method: "Cash on Delivery", delivery_fee: 0, final_total: 10, status: "pending",
    createdAt: new Date(), updatedAt: new Date(),
  });
  assert.equal((await changeStatus(insertedId, "completed")).status, "completed");
  await assert.rejects(changeStatus(insertedId, "bogus"), (err) => err.name === "ValidationError" || err.status === 400);
  assert.equal((await changeStatus(insertedId, "canceled")).status, "canceled");
});

test("a bad line rolls back the whole order", async () => {
  await assert.rejects(placeOrder({ products: [line(), line({ bottle_id: ids.bottle50 })] }, "pos"), { status: 400 });
  assert.deepEqual(await stock(), { oil: 100, alcohol: 1000, bottle: 10 });
  assert.equal(await Order.countDocuments(), 0);
});

test("concurrent POS sales on the same stock both deduct", async () => {
  await Promise.all([placeOrder({ products: [line()] }, "pos"), placeOrder({ products: [line()] }, "pos")]);
  assert.deepEqual(await stock(), { oil: 76, alcohol: 904, bottle: 6 });
});

test("POS line sent as '30ml' matches the stored '30' and records the normalized size", async () => {
  const { order, shortages } = await placeOrder({ products: [line({ size: "30ml" })] }, "pos");
  assert.deepEqual(shortages, []);
  assert.equal(order.products[0].product_size, "30");
});

test("invalid input is rejected with 400", async () => {
  for (const bad of [line({ quantity: 0 }), line({ size: "99ml" }), line({ bottle_id: undefined }), line({ product_id: "nope" })]) {
    await assert.rejects(placeOrder({ products: [bad] }, "pos"), { status: 400 });
  }
  await assert.rejects(placeOrder({ products: [] }, "pos"), { status: 400 });
});

const round2 = (n) => Math.round(n * 100) / 100;

test("per-line and order totals reconcile: total_cost + total_profit equals total_revenue", async () => {
  await Oil.updateOne({ id: "OIL1" }, { oil_cost: 0.335 });
  const product2 = await Product.create({
    p_name: "Test Perfume 2", p_image: ".", p_category: "Men", oil_id: "OIL1",
    size_list: [{ size: "30ml", price: 20 }], oil_percentage: 30, alcohol_percentage: 70,
  });
  const l2 = () => ({ product_id: product2._id.toString(), size: "30", quantity: 1, bottle_id: ids.bottle });
  const { order } = await placeOrder({ products: [l2(), l2(), l2()] }, "pos");
  for (const l of order.products) {
    assert.equal(round2(l.total_cost + l.total_profit), l.total_revenue);
    assert.equal(l.total_cost, 4.44);
    assert.equal(l.total_profit, 15.56);
  }
  assert.equal(round2(order.total_cost + order.total_profit), order.total_revenue);
});

test("cancel refunds oil by its stable _id even if the oil's custom id was renamed", async () => {
  const { order } = await placeOrder({ products: [line()] }, "pos");
  await Oil.updateOne({ id: "OIL1" }, { id: "OIL1-RENAMED" });
  await changeStatus(order._id, "canceled");
  assert.equal((await Oil.findOne({ id: "OIL1-RENAMED" })).oil_quantity, 100);
});
