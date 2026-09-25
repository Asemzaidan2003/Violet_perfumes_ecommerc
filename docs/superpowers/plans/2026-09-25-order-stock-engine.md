# Order & Stock Engine Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move order pricing, costing and stock deduction to the server, in one transaction per order. Orders are never blocked for stock. Stock is deducted only when an order is confirmed through the POS.

**Architecture:**
- One service module, `backend/services/order.service.js`, owns all order/stock rules.
- The thin controllers call it now, and the storefront will call it later.
- Every mutation runs in `mongoose.connection.transaction`.
- The POS checkout posts lines to the server. The browser stock code is deleted.
- Online orders are confirmed from the order details page.

**Tech Stack:** Node 24 ESM, Express 5, Mongoose 8.10 (local MongoDB 8.3 replica set `rs0`), `node:test`, plain HTML/JS (Arabic, RTL).

**Spec:** `docs/superpowers/specs/2026-09-25-order-stock-engine-design.md`

## Global Constraints

- **Local MongoDB only.** Tests use `tests/helpers.js` `startTestApp()`, which provides a per-pid `nsamat_test_<pid>` DB on `127.0.0.1:27017?replicaSet=rs0`. Never Atlas. Never print `.env`.
- **Dependencies:** none new. No new source files beyond `backend/services/order.service.js`. Tests go in `tests/*.test.js`.
- **Never blocked for stock:** stock floors at 0, and gaps are reported as `shortages: [{ item, needed, available }]`.
- **Pricing:** only `source === "pos"` may override a line price. The server ignores client-sent cost and total fields.
- **Errors:** the service throws `Error` with `status` (400/404/409) and `expose: true`. The central handler (`backend/middleware/error.js`) returns `{ success: false, message }`. User-facing messages are in Arabic.
- **Order JSON:** keeps its existing field names (the admin UI and reports read them). New fields are `source`, `stock_deducted`, and per line `oil_id`, `oil_ml`, `alcohol_ml`, `stock`.
- **Files and commits:** keep files under 500 lines. No `Co-Authored-By` trailer. Never commit `.env`.
- **Shell hygiene:** quote every shell pattern and URL, because unquoted `>`, `{` and `$(` have created 0-byte junk files at the repo root before. Check `git status --short` before each commit.

## File Map

| File | Responsibility |
|---|---|
| `backend/models/order.model.js` (edit) | optional bottle, per-line stock fields, `source`, `stock_deducted` |
| `backend/services/order.service.js` (new) | `placeOrder`, `confirmOrder`, `changeStatus`, `removeOrder` |
| `backend/controller/order.Controller.js` (edit) | thin wrappers over the service |
| `backend/routes/order.Routs.js` (edit) | add `POST /:id/confirm` |
| `frontend/js/checkOut.js` (rewrite) | POS posts lines, shows shortages |
| `frontend/js/update_stocks.js`, `frontend/js/getStocks.js` (delete) | browser stock code, replaced by the server |
| `frontend/html/index.html` (edit) | link to unconfirmed orders |
| `frontend/html/order-details.html` (edit) | confirm form for unconfirmed orders |
| `frontend/html/orders.html` (edit) | unconfirmed filter and badge, status 409 handling |
| `tests/order-service.test.js`, `tests/orders-api.test.js` (new) | tests |

---

### Task 1: Order model + order service

**Files:**
- Modify: `backend/models/order.model.js`
- Create: `backend/services/order.service.js`, `tests/order-service.test.js`

**Interfaces:**
- **Produces** (used by Task 2 and, later, the storefront):
  - `placeOrder(input, source: "pos" | "online") → Promise<{ order, shortages }>`
  - `confirmOrder(id, lines: Array<{ bottle_id?, quantity?, price? }>) → Promise<{ order, shortages }>`
  - `changeStatus(id, status: string) → Promise<order>`
  - `removeOrder(id) → Promise<order>`
- **Errors:** thrown errors carry `.status` (400 | 404 | 409).

- [ ] **Step 1: Model changes** in `backend/models/order.model.js`.

  1. In the line's `bottle` sub-object, remove `required: true` from `bottle_id`, `name` and `cost`. They become optional.
  2. Change `cost_price`, `total_cost` and `total_profit` inside `products[]` from `{ type: Number, required: true }` to `{ type: Number, default: 0 }`.
  3. Add these inside each `products[]` item, after `bottle`:
  ```js
        // What the line needs, and what was actually taken at confirmation
        // (less than needed when stock ran short) so a refund returns exactly that.
        oil_id: { type: String },
        oil_ml: { type: Number },
        alcohol_ml: { type: Number },
        stock: {
          oil_ml: Number,
          alcohol_ml: Number,
          alcohol_id: { type: mongoose.Schema.Types.ObjectId },
          bottles: Number,
        },
  ```
  4. Add these at order level, after `created_by`:
  ```js
    source: { type: String, enum: ["pos", "online"], default: "pos" },
    // Legacy orders were deducted in the browser at creation, so the default
    // `true` makes them read as confirmed without a migration.
    stock_deducted: { type: Boolean, default: true },
  ```

- [ ] **Step 2: Failing tests** — `tests/order-service.test.js`

```js
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
    p_name: "Test Perfume", p_image: "x", p_category: "c", oil_id: "OIL1",
    size_list: [{ size: "30ml", price: 20 }], oil_percentage: 20, alcohol_percentage: 80,
  });
  ids = { bottle: bottle._id.toString(), bottle50: bottle50._id.toString(), product: product._id.toString() };
});

const stock = async () => ({
  oil: (await Oil.findOne({ id: "OIL1" })).oil_quantity,
  alcohol: (await Alcohol.findOne()).quantity,
  bottle: (await Bottle.findById(ids.bottle)).quantity,
});
const line = (extra = {}) => ({ product_id: ids.product, size: "30ml", quantity: 2, bottle_id: ids.bottle, ...extra });

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
  const online = await placeOrder({ products: [line({ price: 1, bottle_id: undefined })] }, "online");
  assert.equal(online.order.products[0].selling_price, 18);
});

test("online order is not deducted until confirmed, and confirms once", async () => {
  const { order } = await placeOrder({ products: [line({ bottle_id: undefined })] }, "online");
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

test("shortage never blocks: stock floors at 0 and cancel returns only what was taken", async () => {
  await Oil.updateOne({ id: "OIL1" }, { oil_quantity: 5 });
  const { order, shortages } = await placeOrder({ products: [line()] }, "pos");
  assert.deepEqual(shortages, [{ item: "Test Oil", needed: 12, available: 5 }]);
  assert.equal((await stock()).oil, 0);
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

test("a bad line rolls back the whole order", async () => {
  await assert.rejects(placeOrder({ products: [line(), line({ bottle_id: ids.bottle50 })] }, "pos"), { status: 400 });
  assert.deepEqual(await stock(), { oil: 100, alcohol: 1000, bottle: 10 });
  assert.equal(await Order.countDocuments(), 0);
});

test("concurrent POS sales on the same stock both deduct", async () => {
  await Promise.all([placeOrder({ products: [line()] }, "pos"), placeOrder({ products: [line()] }, "pos")]);
  assert.deepEqual(await stock(), { oil: 76, alcohol: 904, bottle: 6 });
});

test("invalid input is rejected with 400", async () => {
  for (const bad of [line({ quantity: 0 }), line({ size: "99ml" }), line({ bottle_id: undefined }), line({ product_id: "nope" })]) {
    await assert.rejects(placeOrder({ products: [bad] }, "pos"), { status: 400 });
  }
  await assert.rejects(placeOrder({ products: [] }, "pos"), { status: 400 });
});
```

- [ ] **Step 3: Run the tests and expect them to fail.** Run `node --test tests/order-service.test.js`. Expected failure: `Cannot find module '../backend/services/order.service.js'`.

- [ ] **Step 4: `backend/services/order.service.js`**

```js
import mongoose from "mongoose";
import Order from "../models/order.model.js";
import Product from "../models/product.model.js";
import Oil from "../models/oil.model.js";
import Bottle from "../models/bottle.model.js";
import Alcohol from "../models/alcohol.model.js";

// Business rule: an order is never blocked for stock. Stock is deducted only when an
// order is confirmed through the POS; it floors at 0 and any gap is returned as a shortage.

const round2 = (n) => Math.round(n * 100) / 100;
// The central error handler returns `message` for exposed 4xx errors.
const fail = (status, message) => Object.assign(new Error(message), { status, expose: true });
const NEEDS_CONFIRMATION = ["completed", "ready for delivery", "in delivery", "uncollected payment"];

// Order + stock changes commit or roll back together. A concurrent write to the same
// stock record raises a write conflict, which connection.transaction() retries.
async function inTransaction(fn) {
  let result;
  await mongoose.connection.transaction(async (session) => {
    result = await fn(session);
  });
  return result;
}

async function priceLines(items, source, session) {
  if (!Array.isArray(items) || items.length === 0) throw fail(400, "الطلب يجب أن يحتوي على منتج واحد على الأقل");
  const lines = [];
  for (const [i, item] of items.entries()) {
    const n = i + 1;
    const quantity = Number(item?.quantity);
    if (!Number.isInteger(quantity) || quantity < 1) throw fail(400, `السطر ${n}: الكمية يجب أن تكون عددًا صحيحًا 1 أو أكثر`);
    if (!mongoose.isValidObjectId(item.product_id)) throw fail(400, `السطر ${n}: معرّف المنتج غير صالح`);
    const product = await Product.findById(item.product_id).session(session);
    if (!product) throw fail(404, `السطر ${n}: المنتج غير موجود`);
    const ml = parseFloat(item.size);
    const listed = product.size_list.find((s) => s.size === item.size);
    if (!listed || !(ml > 0)) throw fail(400, `السطر ${n}: الحجم "${item.size}" غير متوفر للعطر ${product.p_name}`);

    const override = source === "pos" && item.price != null && item.price !== "";
    const price = override
      ? Number(item.price)
      : round2(listed.price * (1 - (product.p_offer_percentage || 0) / 100));
    if (!Number.isFinite(price) || price < 0) throw fail(400, `السطر ${n}: السعر غير صالح`);

    lines.push({
      product_id: product._id,
      p_name: product.p_name,
      product_size: item.size,
      quantity,
      selling_price: price,
      total_revenue: round2(price * quantity),
      oil_id: product.oil_id,
      oil_ml: round2((product.oil_percentage / 100) * ml * quantity),
      alcohol_ml: round2((product.alcohol_percentage / 100) * ml * quantity),
      bottle: item.bottle_id ? { bottle_id: item.bottle_id } : undefined,
    });
  }
  return lines;
}

// Takes up to `amount` from one stock record (floor 0) and records any shortage.
async function take(Model, filter, field, nameField, amount, missingMessage, ctx) {
  const doc = await Model.findOne(filter).session(ctx.session);
  if (!doc) throw fail(404, missingMessage);
  const had = doc[field];
  if (had < amount) ctx.shortages.push({ item: doc[nameField], needed: amount, available: had });
  const taken = round2(Math.min(Math.max(had, 0), amount));
  await Model.updateOne({ _id: doc._id }, { $set: { [field]: round2(Math.max(0, had - amount)) } }, { session: ctx.session });
  return { doc, taken };
}

function setTotals(order) {
  const sum = (key) => round2(order.products.reduce((s, line) => s + (line[key] || 0), 0));
  order.total_items = order.products.reduce((s, line) => s + line.quantity, 0);
  order.total_revenue = sum("total_revenue");
  order.total_cost = sum("total_cost");
  order.total_profit = sum("total_profit");
  order.final_total = round2(order.total_revenue + (order.delivery_fee || 0));
}

async function deductAndCost(order, session) {
  const ctx = { session, shortages: [] };
  for (const [i, line] of order.products.entries()) {
    const n = i + 1;
    const bottleId = line.bottle?.bottle_id;
    if (!bottleId || !mongoose.isValidObjectId(bottleId)) throw fail(400, `السطر ${n}: يرجى اختيار زجاجة`);
    if (!line.oil_id) throw fail(400, `السطر ${n}: المنتج غير مرتبط بزيت`);

    const bottle = await take(Bottle, { _id: bottleId }, "quantity", "name", line.quantity, `السطر ${n}: الزجاجة غير موجودة`, ctx);
    if (bottle.doc.capacity !== parseFloat(line.product_size)) {
      throw fail(400, `السطر ${n}: الزجاجة "${bottle.doc.name}" سعتها ${bottle.doc.capacity} مل بينما الحجم ${line.product_size}`);
    }
    const oil = await take(Oil, { id: line.oil_id }, "oil_quantity", "oil_name", line.oil_ml, `السطر ${n}: الزيت ${line.oil_id} غير موجود`, ctx);
    const alcohol = await take(Alcohol, {}, "quantity", "name", line.alcohol_ml, "سجل الكحول غير موجود", ctx);

    const cost = line.oil_ml * oil.doc.oil_cost + line.alcohol_ml * alcohol.doc.cost + line.quantity * bottle.doc.cost;
    line.bottle = { bottle_id: bottle.doc._id, name: bottle.doc.name, cost: bottle.doc.cost };
    line.stock = { oil_ml: oil.taken, alcohol_ml: alcohol.taken, alcohol_id: alcohol.doc._id, bottles: bottle.taken };
    line.total_cost = round2(cost);
    line.cost_price = round2(cost / line.quantity);
    line.total_profit = round2(line.total_revenue - cost);
  }
  order.stock_deducted = true;
  setTotals(order);
  return ctx.shortages;
}

async function restock(order, session) {
  if (!order.stock_deducted) return;
  for (const line of order.products) {
    const s = line.stock;
    if (s?.bottles == null) continue; // legacy line: the deducted amounts were never recorded
    await Oil.updateOne({ id: line.oil_id }, { $inc: { oil_quantity: s.oil_ml } }, { session });
    await Alcohol.updateOne({ _id: s.alcohol_id }, { $inc: { quantity: s.alcohol_ml } }, { session });
    await Bottle.updateOne({ _id: line.bottle.bottle_id }, { $inc: { quantity: s.bottles } }, { session });
  }
  order.stock_deducted = false;
}

export async function placeOrder(input = {}, source = "pos") {
  const deliveryFee = Number(input.delivery_fee ?? 0);
  if (!Number.isFinite(deliveryFee) || deliveryFee < 0) throw fail(400, "رسوم التوصيل غير صالحة");
  return inTransaction(async (session) => {
    const order = new Order({
      products: await priceLines(input.products, source, session),
      source,
      customer_id: input.customer_id || undefined,
      payment_method: input.payment_method || "Cash",
      delivery_fee: deliveryFee,
      order_notes: input.order_notes || "",
      created_by: source === "pos" ? "admin" : "online",
      stock_deducted: false,
      total_items: 0, total_revenue: 0, total_cost: 0, total_profit: 0, final_total: 0,
    });
    setTotals(order);
    const shortages = source === "pos" ? await deductAndCost(order, session) : [];
    await order.save({ session });
    return { order, shortages };
  });
}

export async function confirmOrder(id, edits = []) {
  if (!Array.isArray(edits)) throw fail(400, "بيانات الأسطر غير صالحة");
  return inTransaction(async (session) => {
    const order = await Order.findById(id).session(session);
    if (!order) throw fail(404, "الطلب غير موجود");
    if (order.status === "canceled") throw fail(409, "الطلب ملغي");
    if (order.stock_deducted) throw fail(409, "تم تأكيد هذا الطلب مسبقًا");

    order.products.forEach((line, i) => {
      const edit = edits[i] || {};
      if (edit.quantity != null && edit.quantity !== "") {
        const q = Number(edit.quantity);
        if (!Number.isInteger(q) || q < 1) throw fail(400, `السطر ${i + 1}: الكمية يجب أن تكون عددًا صحيحًا 1 أو أكثر`);
        line.oil_ml = round2((line.oil_ml / line.quantity) * q);
        line.alcohol_ml = round2((line.alcohol_ml / line.quantity) * q);
        line.quantity = q;
      }
      if (edit.price != null && edit.price !== "") {
        const p = Number(edit.price);
        if (!Number.isFinite(p) || p < 0) throw fail(400, `السطر ${i + 1}: السعر غير صالح`);
        line.selling_price = p;
      }
      line.total_revenue = round2(line.selling_price * line.quantity);
      if (edit.bottle_id) line.bottle = { bottle_id: edit.bottle_id };
    });

    const shortages = await deductAndCost(order, session);
    await order.save({ session });
    return { order, shortages };
  });
}

export async function changeStatus(id, status) {
  if (typeof status !== "string" || !status) throw fail(400, "الحالة مطلوبة");
  return inTransaction(async (session) => {
    const order = await Order.findById(id).session(session);
    if (!order) throw fail(404, "الطلب غير موجود");
    if (order.status === "canceled" && status !== "canceled") throw fail(409, "لا يمكن إعادة فتح طلب ملغي");
    if (NEEDS_CONFIRMATION.includes(status) && !order.stock_deducted) {
      throw fail(409, "يرجى تأكيد الطلب من نقطة البيع أولًا");
    }
    if (status === "canceled" && order.status !== "canceled") await restock(order, session);
    order.status = status;
    await order.save({ session });
    return order;
  });
}

export async function removeOrder(id) {
  return inTransaction(async (session) => {
    const order = await Order.findById(id).session(session);
    if (!order) throw fail(404, "الطلب غير موجود");
    if (order.status !== "canceled") await restock(order, session);
    await order.deleteOne({ session });
    return order;
  });
}
```

- [ ] **Step 5: Run the tests and expect them to pass.** Run `node --test tests/order-service.test.js` (9 passing), then the full `npm test`, where the existing 19 must still pass. If the concurrency test flakes, run it 5 times. It must be deterministic, because `connection.transaction` retries write conflicts. If it isn't, report BLOCKED with the output. Do not weaken the assertion.

- [ ] **Step 6: Commit**
```bash
git add backend/models/order.model.js backend/services/order.service.js tests/order-service.test.js
git commit -m "feat: server-side order service with transactional stock deduction"
```

---

### Task 2: Order routes use the service

**Files:**
- Modify: `backend/controller/order.Controller.js`, `backend/routes/order.Routs.js`
- Test: `tests/orders-api.test.js`

**Interfaces:**
- **Consumes:** Task 1 service functions, and `startTestApp`/`loginAs` from `tests/helpers.js`.
- **Produces:** these HTTP contracts, consumed by Tasks 3–4:
  - `POST /api/orders` → 201 `{ message, data, shortages }`
  - `POST /api/orders/:id/confirm` with `{ lines }` → 200 `{ message, data, shortages }`
  - `PUT /api/orders/:id` with `{ status }` → 200 `{ message, data }`, or 409 `{ success: false, message }`
  - `DELETE /api/orders/:id` → 200 `{ message, data }`

- [ ] **Step 1: Failing tests** — `tests/orders-api.test.js`

```js
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { startTestApp, loginAs } from "./helpers.js";
import { placeOrder } from "../backend/services/order.service.js";
import Oil from "../backend/models/oil.model.js";
import Bottle from "../backend/models/bottle.model.js";
import Alcohol from "../backend/models/alcohol.model.js";
import Product from "../backend/models/product.model.js";

let t, cookie, ids;
before(async () => {
  t = await startTestApp();
  cookie = await loginAs(t.url);
  await Oil.create({ id: "OIL1", oil_name: "Test Oil", oil_cost: 0.5, oil_quantity: 100 });
  await Alcohol.create({ name: "Ethanol", type: "perfumer", quantity: 1000, cost: 0.02 });
  const bottle = await Bottle.create({ name: "B30", capacity: 30, cost: 1, quantity: 10 });
  const product = await Product.create({
    p_name: "Test Perfume", p_image: "x", p_category: "c", oil_id: "OIL1",
    size_list: [{ size: "30ml", price: 20 }], oil_percentage: 20, alcohol_percentage: 80,
  });
  ids = { bottle: bottle._id.toString(), product: product._id.toString() };
});
after(() => t.close());

const api = (path, method = "GET", body) => fetch(`${t.url}/api${path}`, {
  method, headers: { cookie, "Content-Type": "application/json" },
  body: body === undefined ? undefined : JSON.stringify(body),
});

test("POST /api/orders creates a confirmed POS order and reports shortages", async () => {
  const res = await api("/orders", "POST", {
    products: [{ product_id: ids.product, size: "30ml", quantity: 1, price: 20, bottle_id: ids.bottle }],
    payment_method: "Cash",
  });
  assert.equal(res.status, 201);
  const body = await res.json();
  assert.equal(body.data.stock_deducted, true);
  assert.deepEqual(body.shortages, []);
  assert.equal((await Oil.findOne({ id: "OIL1" })).oil_quantity, 94);
});

test("status rules and confirm endpoint over HTTP", async () => {
  const { order } = await placeOrder({ products: [{ product_id: ids.product, size: "30ml", quantity: 1 }] }, "online");
  const blocked = await api(`/orders/${order._id}`, "PUT", { status: "completed" });
  assert.equal(blocked.status, 409);
  assert.deepEqual(Object.keys(await blocked.json()).sort(), ["message", "success"]);

  const confirmed = await api(`/orders/${order._id}/confirm`, "POST", { lines: [{ bottle_id: ids.bottle }] });
  assert.equal(confirmed.status, 200);
  assert.equal((await confirmed.json()).data.stock_deducted, true);

  assert.equal((await api(`/orders/${order._id}`, "PUT", { status: "completed" })).status, 200);
  assert.equal((await api(`/orders/${order._id}`, "DELETE")).status, 200);
  assert.equal((await api(`/orders/${order._id}`)).status, 404);
});

test("missing status is 400", async () => {
  const { order } = await placeOrder({ products: [{ product_id: ids.product, size: "30ml", quantity: 1, bottle_id: ids.bottle }] }, "pos");
  assert.equal((await api(`/orders/${order._id}`, "PUT", {})).status, 400);
});
```

- [ ] **Step 2: Run the tests and expect them to fail.** Run `node --test tests/orders-api.test.js`. Expected failures: the confirm route returns 401→404 (not mounted) and the status guard is missing.

- [ ] **Step 3: `backend/controller/order.Controller.js`** — rewrite it in full. The GET handlers stay as they are.

```js
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
```

- [ ] **Step 4: Route.** In `backend/routes/order.Routs.js`:
  1. Add `confirmOrder` to the import list.
  2. Add `router.post('/:id/confirm', confirmOrder);` after `router.post('/', createOrder);`.

- [ ] **Step 5: Run the tests and expect them to pass.** Run `node --test tests/orders-api.test.js` (3 passing), then the full `npm test`.

- [ ] **Step 6: Commit**
```bash
git add backend/controller/order.Controller.js backend/routes/order.Routs.js tests/orders-api.test.js
git commit -m "feat: order routes use the order service; add confirm endpoint"
```

---

### Task 3: POS checkout posts to the server

**Files:**
- Rewrite: `frontend/js/checkOut.js`
- Delete: `frontend/js/update_stocks.js`, `frontend/js/getStocks.js`
- Modify: `frontend/html/index.html`

**Interfaces:**
- **Consumes:** `POST /api/orders` (Task 2).
- **Cart item shape** (built in index.html): `{ id, name, size, quantity, price, total, oil_id, oil_percentage, alcohol_percentage, bottle: { bottle_id, quantity } }`.
- **Call site:** index.html calls `checkout({ products: cart, total_items, total_price, customer_id })`.

- [ ] **Step 1: `frontend/js/checkOut.js`** (full rewrite)

```js
// POS checkout: the server prices, costs and deducts stock in one transaction.
// Sales are never blocked for stock; the server reports what ran short.
export async function checkout(cart) {
  const body = {
    products: cart.products.map((item) => ({
      product_id: item.id,
      size: item.size,
      quantity: item.quantity,
      price: item.price,
      bottle_id: item.bottle?.bottle_id,
    })),
    customer_id: cart.customer_id,
    payment_method: "Cash",
  };

  try {
    const res = await fetch("/api/orders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!res.ok) {
      alert(data.message || "فشل في تنفيذ الطلب");
      return;
    }
    let msg = "✅ تم إنشاء الطلب بنجاح!";
    if (data.shortages?.length) {
      msg += "\n\n⚠️ المخزون غير كافٍ لهذه المواد (تم تصفيرها):\n" +
        data.shortages.map((s) => `${s.item}: المطلوب ${s.needed}، المتوفر ${s.available}`).join("\n");
    }
    alert(msg);
    window.location.reload();
  } catch (err) {
    console.error("❌ Error creating order:", err);
    alert("فشل في تنفيذ الطلب");
  }
}

// للتنفيذ من خلال الزر
window.checkout = checkout;
```

- [ ] **Step 2: Delete the browser stock code.**
  1. Run `git rm frontend/js/update_stocks.js frontend/js/getStocks.js`.
  2. Run `grep -rn "update_stocks\|getStocks" frontend`. Expect no output.

- [ ] **Step 3: Unconfirmed-orders link in `frontend/html/index.html`.**

  1. In the `page-head` block (the `<div class="page-head">` that holds the `نقطة البيع` eyebrow), add this after the inner `<div>…</div>`:
  ```html
      <a href="orders.html?filter=unconfirmed" class="btn btn-primary" id="unconfirmedLink" style="display: none;"></a>
  ```
  2. In the page's main inline `<script>`, directly after `const baseURL = "/api";`, add:
  ```js
    // طلبات الموقع التي لم تُؤكَّد بعد (لم يُخصم مخزونها)
    fetch(`${baseURL}/orders`)
      .then((r) => r.json())
      .then(({ data }) => {
        const n = (data || []).filter((o) => o.stock_deducted === false && o.status !== "canceled").length;
        const link = document.getElementById("unconfirmedLink");
        if (n) {
          link.textContent = `طلبات بانتظار التأكيد (${n})`;
          link.style.display = "";
        }
      })
      .catch((err) => console.error("Error fetching orders:", err));
  ```
  The `style.display` toggle is used instead of `hidden` because `.btn` sets `display` and would override the `hidden` attribute.

- [ ] **Step 4: Verify.**
  - Run `node --check frontend/js/checkOut.js`.
  - Run `npm test`; all tests must pass.
  - HTTP smoke test against the dev server:
    1. Run `node backend/server.js` in the background.
    2. Log in once with curl and a cookie jar, reading `ADMIN_USERNAME`/`ADMIN_PASSWORD` from `.env` inside the command without echoing them.
    3. `GET /admin/html/index.html` → 200.
    4. `GET /admin/js/checkOut.js` → 200, and `GET /admin/js/update_stocks.js` → 404.
    5. Stop the server.
  - Do NOT place a real order against `nsamat_dev`: it holds the shop's real data.

- [ ] **Step 5: Commit**
```bash
git add frontend/js/checkOut.js frontend/html/index.html
git commit -m "feat: POS checkout posts lines to the server; drop browser stock code"
```

---

### Task 4: Confirm online orders from the order pages

**Files:**
- Modify: `frontend/html/order-details.html`, `frontend/html/orders.html`

**Interfaces:**
- **Consumes:**
  - `POST /api/orders/:id/confirm` with `{ lines: [{ bottle_id, quantity, price }] }` → `{ data, shortages }`, or `{ success: false, message }`
  - `PUT /api/orders/:id` → 409 `{ message }`
  - `GET /api/bottles` → `{ data: [{ _id, name, capacity, quantity }] }`
- **Order JSON:** includes `stock_deducted` and `source`.

- [ ] **Step 1: `order-details.html` confirm form.**

  1. After the closing `</div>` of `<div class="table-card">`, add:
  ```html
    <div class="form-actions" id="confirmBar" style="display: none; margin-top: 16px;">
      <button class="btn btn-primary" id="confirmBtn">تأكيد الطلب وخصم المخزون</button>
    </div>
  ```
  2. In `renderOrderDetails`, add two summary items inside `.summary-grid`:
  ```js
          <div class="item"><div class="label">المصدر</div><div class="val">${order.source === "online" ? "الموقع" : "نقطة البيع"}</div></div>
          <div class="item"><div class="label">المخزون</div><div class="val">${order.stock_deducted === false ? "بانتظار التأكيد" : "تم الخصم"}</div></div>
  ```
  3. At the end of `renderOrderDetails`, add:
  ```js
      if (order.stock_deducted === false && order.status !== "canceled") renderConfirmForm(order);
  ```
  4. Add these functions to the same script:
  ```js
    // طلب من الموقع: اختيار الزجاجات ثم التأكيد لخصم المخزون
    async function renderConfirmForm(order) {
      const res = await fetch(`${baseURL}/bottles`);
      const bottles = (await res.json()).data || [];
      document.getElementById("productsTable").innerHTML = order.products.map((p, i) => {
        const options = bottles
          .filter((b) => b.capacity === parseFloat(p.product_size))
          .map((b) => `<option value="${b._id}">${b.name} (المتوفر: ${b.quantity})</option>`)
          .join("");
        return `
          <tr>
            <td>${i + 1}</td>
            <td class="cell-strong">${p.p_name}</td>
            <td>${p.product_size}</td>
            <td><input class="qty-input" type="number" min="1" step="1" id="qty-${i}" value="${p.quantity}"></td>
            <td><input class="price-input" type="number" min="0" step="0.01" id="price-${i}" value="${p.selling_price}"></td>
            <td><select id="bottle-${i}"><option value="">-- اختر زجاجة --</option>${options}</select></td>
            <td class="num">${p.total_revenue.toFixed(2)}</td>
            <td class="num">-</td>
            <td class="num">-</td>
          </tr>`;
      }).join("");
      document.getElementById("confirmBar").style.display = "";
      document.getElementById("confirmBtn").onclick = () => submitConfirm(order);
    }

    async function submitConfirm(order) {
      const lines = order.products.map((_, i) => ({
        bottle_id: document.getElementById(`bottle-${i}`).value,
        quantity: document.getElementById(`qty-${i}`).value,
        price: document.getElementById(`price-${i}`).value,
      }));
      if (lines.some((l) => !l.bottle_id)) return alert("يرجى اختيار زجاجة لكل منتج");
      const res = await fetch(`${baseURL}/orders/${order._id}/confirm`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lines }),
      });
      const data = await res.json();
      if (!res.ok) return alert(data.message || "تعذر تأكيد الطلب");
      let msg = "✅ تم تأكيد الطلب وخصم المخزون";
      if (data.shortages?.length) {
        msg += "\n\n⚠️ المخزون غير كافٍ لهذه المواد (تم تصفيرها):\n" +
          data.shortages.map((s) => `${s.item}: المطلوب ${s.needed}، المتوفر ${s.available}`).join("\n");
      }
      alert(msg);
      location.reload();
    }
  ```

- [ ] **Step 2: `orders.html` unconfirmed filter, badge, and 409 handling.**

  1. In `<select id="statusFilter">`, add `<option value="unconfirmed">بانتظار التأكيد</option>` right after the `الكل` option.
  2. In `applyFilters`, replace `if (status) filtered = filtered.filter(o => o.status === status);` with:
  ```js
      if (status === "unconfirmed") filtered = filtered.filter(o => o.stock_deducted === false && o.status !== "canceled");
      else if (status) filtered = filtered.filter(o => o.status === status);
  ```
  3. At the end of `loadOrders`, after `renderOrders(window._filteredOrders);`, add:
  ```js
      // POS link: orders.html?filter=unconfirmed
      const preset = new URLSearchParams(window.location.search).get("filter");
      if (preset) {
        document.getElementById("statusFilter").value = preset;
        applyFilters();
      }
  ```
  4. In `renderOrders`, change the customer-name cell to:
  ```js
            <td class="cell-strong">${order.customer && order.customer.name ? order.customer.name : "-"}${order.stock_deducted === false && order.status !== "canceled" ? ' <span class="badge badge-pending">بانتظار التأكيد</span>' : ""}</td>
  ```
  5. Replace `updateOrderStatus` and `handleStatusChange` with:
  ```js
    async function updateOrderStatus(id, newStatus) {
      try {
        const res = await fetch(`${baseURL}/orders/${id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: newStatus }),
        });
        if (res.ok) return true;
        const data = await res.json().catch(() => ({}));
        alert(data.message || "تعذر تحديث حالة الطلب");
      } catch (err) {
        console.error("Error updating order status:", err);
        alert("تعذر تحديث حالة الطلب");
      }
      return false;
    }

    async function handleStatusChange(id, selectElement) {
      const newStatus = selectElement.value;
      if (await updateOrderStatus(id, newStatus)) {
        const orderInAll = (window._allOrders || []).find(o => o._id === id);
        if (orderInAll) orderInAll.status = newStatus;
        const orderInFiltered = (window._filteredOrders || []).find(o => o._id === id);
        if (orderInFiltered) orderInFiltered.status = newStatus;
      }
      renderOrders(window._filteredOrders); // on failure this reverts the select
    }
  ```
  6. Cancelling marks the order unconfirmed on the server. For `stock_deducted` to stay accurate in the list after a cancel, add this inside the success branch:
  ```js
        if (newStatus === "canceled") {
          if (orderInAll) orderInAll.stock_deducted = false;
          if (orderInFiltered) orderInFiltered.stock_deducted = false;
        }
  ```

- [ ] **Step 3: Verify.**
  - Run `npm test`; all tests must pass.
  - HTTP smoke test on the dev server, with one login:
    1. `GET /admin/html/orders.html` → 200.
    2. `GET /admin/html/order-details.html` → 200.
    3. Check `grep -c "unconfirmed" frontend/html/orders.html` ≥ 3.
    4. Stop the server.
  - Do not create, confirm or change orders in `nsamat_dev`.

- [ ] **Step 4: Commit**
```bash
git add frontend/html/order-details.html frontend/html/orders.html
git commit -m "feat: confirm online orders from order details; unconfirmed filter and status errors"
```

---

### Task 5: Final verification (controller)

- [ ] Run `npm test`: all tests pass (19 existing + 12 new).
- [ ] Run `git grep -n "update_stocks\|getStocks"` on tracked code. Expect no hits.
- [ ] Hand the user the browser checklist. The dev DB has real data, so they should place a test POS sale and then cancel it:
  1. **Check the sale:** confirm the order was created and that oil, alcohol and bottle stock dropped.
  2. **Check the cancel:** confirm the stock came back.
  3. **Check the unconfirmed flow:** use the "unconfirmed" filter.
- [ ] Run the `superpowers:requesting-code-review` final review.
