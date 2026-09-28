import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { startTestApp, loginAs } from "./helpers.js";
import Order from "../backend/models/order.model.js";
import mongoose from "mongoose";

let t, cookie;
before(async () => {
  t = await startTestApp();
  cookie = await loginAs(t.url);

  const product_id = new mongoose.Types.ObjectId();
  const line = {
    product_id, p_name: "Test Perfume", product_size: "30ml", quantity: 1,
    selling_price: 20, cost_price: 5, total_revenue: 20, total_cost: 5, total_profit: 15,
  };

  // Confirmed pending order: counts.
  await Order.create({
    products: [line], total_items: 1, total_revenue: 20, total_cost: 5, total_profit: 15,
    payment_method: "Cash", final_total: 20, status: "pending", stock_deducted: true,
  });

  // Unconfirmed online order: no cost deducted yet, must be excluded even
  // though its status is "pending" or under "all".
  await Order.create({
    products: [line], total_items: 1, total_revenue: 100, total_cost: 0, total_profit: 100,
    payment_method: "Cash", final_total: 100, status: "pending", stock_deducted: false, source: "online",
  });
});
after(() => t.close());

const api = (path) => fetch(`${t.url}/api${path}`, { headers: { cookie } });

test("sales report excludes unconfirmed (stock_deducted: false) orders under status=all", async () => {
  const res = await api("/reports/sales?status=all&from=2000-01-01&to=2100-01-01");
  const body = await res.json();
  assert.equal(res.status, 200);
  assert.equal(body.data.totals.revenue, 20);
  assert.equal(body.data.totals.orders_count, 1);
});

test("sales report excludes unconfirmed orders under an explicit status=pending", async () => {
  const res = await api("/reports/sales?status=pending&from=2000-01-01&to=2100-01-01");
  const body = await res.json();
  assert.equal(res.status, 200);
  assert.equal(body.data.totals.revenue, 20);
  assert.equal(body.data.totals.orders_count, 1);
});
