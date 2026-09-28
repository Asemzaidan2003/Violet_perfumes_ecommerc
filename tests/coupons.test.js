import { test, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { once } from "node:events";
import { startTestApp, loginAs } from "./helpers.js";
import { createApp } from "../backend/app.js";
import Product from "../backend/models/product.model.js";
import Order from "../backend/models/order.model.js";
import Coupon from "../backend/models/coupon.model.js";
import Oil from "../backend/models/oil.model.js";
import Bottle from "../backend/models/bottle.model.js";
import Alcohol from "../backend/models/alcohol.model.js";
import Setting from "../backend/models/setting.model.js";
import { placeOrder } from "../backend/services/order.service.js";
import { normalizeCode, claimCoupon, releaseCoupon } from "../backend/services/coupons.service.js";

const GENERIC = "الكود غير صالح أو منتهي";
const round2 = (n) => Math.round(n * 100) / 100;
let t, cookie, ids;

before(async () => {
  t = await startTestApp({ limits: { orders: { max: 1000 }, coupons: { max: 1000 } } });
  cookie = await loginAs(t.url);
  await Promise.all([Order.createIndexes(), Coupon.createIndexes()]); // unique indexes dropped by dropDatabase()
});
after(() => t.close());

beforeEach(async () => {
  await Promise.all([Product, Order, Coupon, Oil, Bottle, Alcohol, Setting].map((M) => M.deleteMany({})));
  await Oil.create({ id: "OIL1", oil_name: "Test Oil", oil_cost: 0.5, oil_quantity: 100 });
  await Alcohol.create({ name: "Ethanol", type: "perfumer", quantity: 1000, cost: 0.02 });
  const bottle = await Bottle.create({ name: "B30", capacity: 30, cost: 1, quantity: 10 });
  const product = await Product.create({
    p_name: "Test Perfume", p_image: ".", p_category: "Men", oil_id: "OIL1",
    size_list: [{ size: "30", price: 20 }], oil_percentage: 20, alcohol_percentage: 80,
  });
  await Setting.create({ _id: "shop", delivery_fee: 3, free_delivery_over: 100 });
  await Coupon.create([
    { code: "SAVE10", type: "percent", value: 10 },
    { code: "FLAT5", type: "fixed", value: 5 },
    { code: "BIG", type: "fixed", value: 500 },
  ]);
  ids = { product: String(product._id), bottle: String(bottle._id) };
});

const body = (overrides = {}) => ({
  items: [{ product_id: ids.product, size: "30", quantity: 2 }], // 40.00
  customer: { name: "سارة علي", phone: "0791234567", city: "عمّان", address: "شارع الجامعة 12" },
  client_key: crypto.randomUUID(),
  ...overrides,
});
const post = (url, path, data, headers = {}) => fetch(`${url}${path}`, {
  method: "POST", headers: { "Content-Type": "application/json", ...headers }, body: JSON.stringify(data),
});
const check = (code, subtotal = 40) => post(t.url, "/api/store/coupons/check", { code, subtotal }).then((r) => r.json());
const order = (data) => post(t.url, "/api/store/orders", body(data));
const admin = (path, init = {}) => fetch(`${t.url}/api${path}`, {
  ...init, headers: { cookie, "Content-Type": "application/json", ...init.headers },
});
const used = async (code) => (await Coupon.findOne({ code })).used;
const placed = async (res) => Order.findOne({ public_ref: (await res.json()).data.ref });

test("normalizeCode trims and uppercases, and rejects bad shapes", () => {
  assert.equal(normalizeCode("  save10 "), "SAVE10");
  assert.equal(normalizeCode("ab"), null);
  assert.equal(normalizeCode("A".repeat(21)), null);
  assert.equal(normalizeCode("BAD CODE"), null);
  assert.equal(normalizeCode(undefined), null);
});

test("claimCoupon is guarded on active and remaining uses; releaseCoupon never goes below 0", async () => {
  await Coupon.create([
    { code: "ONE", type: "fixed", value: 1, max_uses: 1 },
    { code: "OFF", type: "fixed", value: 1, active: false },
  ]);
  assert.equal((await claimCoupon("ONE")).used, 1);
  assert.equal(await claimCoupon("ONE"), null);
  assert.equal(await claimCoupon("OFF"), null);
  assert.equal((await claimCoupon("SAVE10")).used, 1); // max_uses 0 = unlimited
  assert.equal((await claimCoupon("SAVE10")).used, 2);
  await releaseCoupon("OFF");
  assert.equal(await used("OFF"), 0);
  await releaseCoupon("MISSING"); // deleted coupon: no-op, no throw
});

test("percent, fixed and capped fixed discounts", async () => {
  const pct = await check("SAVE10");
  assert.equal(pct.success, true);
  assert.equal(pct.valid, true);
  assert.equal(pct.discount, 4);
  assert.equal((await check("FLAT5")).discount, 5);
  assert.equal((await check("BIG")).discount, 40);

  const res = await order({ coupon: "SAVE10" });
  assert.equal(res.status, 201);
  const data = (await res.json()).data;
  assert.equal(data.subtotal, 40);
  assert.equal(data.discount, 4);
  assert.equal(data.delivery_fee, 3);
  assert.equal(data.total, 39);
  assert.equal(data.coupon, "SAVE10");

  const capped = await (await order({ coupon: "BIG" })).json();
  assert.equal(capped.data.discount, 40);
  assert.equal(capped.data.total, 3); // delivery fee comes from the pre-discount subtotal
});

test("coupon windows: start inclusive, end exclusive; inactive is invalid", async () => {
  const now = Date.now();
  await Coupon.create([
    { code: "LATER", type: "percent", value: 10, starts_at: new Date(now + 3600_000) },
    { code: "ENDED", type: "percent", value: 10, ends_at: new Date(now - 1) },
    { code: "OPEN", type: "percent", value: 10, ends_at: new Date(now + 3600_000) },
    { code: "OFF", type: "percent", value: 10, active: false },
  ]);
  assert.equal((await check("LATER")).valid, false);
  assert.equal((await check("ENDED")).valid, false);
  assert.equal((await check("OPEN")).valid, true);
  assert.equal((await check("OFF")).valid, false);
});

test("unknown, inactive, expired and used-up codes give the identical message", async () => {
  await Coupon.create([
    { code: "OFF", type: "percent", value: 10, active: false },
    { code: "ENDED", type: "percent", value: 10, ends_at: new Date(Date.now() - 1) },
    { code: "GONE", type: "percent", value: 10, max_uses: 1, used: 1 },
  ]);
  const results = await Promise.all(["NOPE", "OFF", "ENDED", "GONE", "x"].map((c) => check(c)));
  for (const r of results) assert.deepEqual(r, { success: true, valid: false, discount: 0, message: GENERIC });
});

test("min_subtotal failure says how much more is needed", async () => {
  await Coupon.create({ code: "MIN50", type: "percent", value: 10, min_subtotal: 50 });
  const r = await check("MIN50", 40);
  assert.equal(r.valid, false);
  assert.match(r.message, /10\.00/);
  assert.equal((await check("MIN50", 50)).valid, true);

  const res = await order({ coupon: "MIN50" });
  assert.equal(res.status, 400);
  assert.match((await res.json()).message, /10\.00/);
  assert.equal(await used("MIN50"), 0);
});

test("a lowercase, space-padded code works at check and at order", async () => {
  assert.equal((await check("  save10 ")).valid, true);
  const res = await order({ coupon: "  save10 " });
  assert.equal(res.status, 201);
  assert.equal((await res.json()).data.discount, 4);
});

test("check rejects a bad subtotal", async () => {
  const res = await post(t.url, "/api/store/coupons/check", { code: "SAVE10", subtotal: "abc" });
  assert.equal(res.status, 400);
});

test("an online order stores the coupon snapshot and claims a use; a bad code fails the order", async () => {
  const res = await order({ coupon: "SAVE10" });
  assert.equal(res.status, 201);
  const o = await placed(res);
  assert.deepEqual({ ...o.coupon.toObject() }, { code: "SAVE10", type: "percent", value: 10 });
  assert.equal(o.discount, 4);
  assert.equal(o.total_profit, 0); // unconfirmed online order
  assert.equal(await used("SAVE10"), 1);

  const bad = await order({ coupon: "NOPE" });
  assert.equal(bad.status, 400);
  assert.equal((await bad.json()).message, GENERIC);
  assert.equal(await Order.countDocuments(), 1);
});

test("an order without a coupon has discount 0", async () => {
  const res = await order({});
  const data = (await res.json()).data;
  assert.equal(data.discount, 0);
  assert.equal(data.coupon, null);
  assert.equal(data.total, 43);
});

test("a POS order ignores coupon_code", async () => {
  const { order: o } = await placeOrder({
    products: [{ product_id: ids.product, size: "30", quantity: 2, bottle_id: ids.bottle }],
    coupon_code: "SAVE10",
  }, "pos");
  assert.equal(o.discount, 0);
  assert.equal(o.coupon?.code, undefined);
  assert.equal(o.final_total, 40);
  assert.equal(await used("SAVE10"), 0);
});

test("two concurrent orders on a 1-use code: exactly one succeeds", async () => {
  await Coupon.create({ code: "MAX1", type: "fixed", value: 5, max_uses: 1 });
  const results = await Promise.all([order({ coupon: "MAX1" }), order({ coupon: "MAX1" })]);
  const statuses = results.map((r) => r.status).sort();
  assert.deepEqual(statuses, [201, 400]);
  const failed = results.find((r) => r.status === 400);
  assert.match((await failed.json()).message, /[؀-ۿ]/);
  assert.equal(await used("MAX1"), 1);
  assert.equal(await Order.countDocuments(), 1);
});

test("replaying the same client_key with a coupon claims one use", async () => {
  const key = crypto.randomUUID();
  assert.equal((await order({ coupon: "SAVE10", client_key: key })).status, 201);
  assert.equal((await order({ coupon: "SAVE10", client_key: key })).status, 200);
  const [a, b] = await Promise.all([order({ coupon: "FLAT5", client_key: key }), order({ coupon: "FLAT5", client_key: key })]);
  assert.deepEqual([a.status, b.status], [200, 200]);
  assert.equal(await used("SAVE10"), 1);
  assert.equal(await used("FLAT5"), 0);
});

test("concurrent first submissions with the same client_key claim one use", async () => {
  const key = crypto.randomUUID();
  const rs = await Promise.all([order({ coupon: "SAVE10", client_key: key }), order({ coupon: "SAVE10", client_key: key })]);
  assert.ok(rs.every((r) => [200, 201].includes(r.status)), rs.map((r) => r.status).join());
  assert.equal(await Order.countDocuments(), 1);
  assert.equal(await used("SAVE10"), 1);
});

test("a use is returned exactly once: cancel, cancel again, then delete", async () => {
  const o = await placed(await order({ coupon: "SAVE10" }));
  assert.equal(await used("SAVE10"), 1);
  const cancel = () => admin(`/orders/${o._id}`, { method: "PUT", body: JSON.stringify({ status: "canceled" }) });
  assert.equal((await cancel()).status, 200);
  assert.equal(await used("SAVE10"), 0);
  // Another order keeps `used` above 0, so a wrongly repeated release would show.
  await order({ coupon: "SAVE10" });
  assert.equal(await used("SAVE10"), 1);
  await cancel();
  assert.equal(await used("SAVE10"), 1);
  assert.equal((await admin(`/orders/${o._id}`, { method: "DELETE" })).status, 200);
  assert.equal(await used("SAVE10"), 1);
});

test("deleting a non-canceled order returns its use once", async () => {
  const o = await placed(await order({ coupon: "SAVE10" }));
  await order({ coupon: "SAVE10" });
  assert.equal(await used("SAVE10"), 2);
  assert.equal((await admin(`/orders/${o._id}`, { method: "DELETE" })).status, 200);
  assert.equal(await used("SAVE10"), 1);
});

test("cancelling an order whose coupon was deleted does not throw", async () => {
  const o = await placed(await order({ coupon: "SAVE10" }));
  await Coupon.deleteOne({ code: "SAVE10" });
  const res = await admin(`/orders/${o._id}`, { method: "PUT", body: JSON.stringify({ status: "canceled" }) });
  assert.equal(res.status, 200);
  assert.equal(await Coupon.countDocuments({ code: "SAVE10" }), 0);
});

test("confirming with an edited quantity re-derives the discount and profit", async () => {
  const o = await placed(await order({ coupon: "SAVE10", items: [{ product_id: ids.product, size: "30", quantity: 1 }] }));
  assert.equal(o.discount, 2);
  assert.equal(o.total_profit, 0);
  const res = await admin(`/orders/${o._id}/confirm`, {
    method: "POST", body: JSON.stringify({ lines: [{ bottle_id: ids.bottle, quantity: 2 }] }),
  });
  assert.equal(res.status, 200);
  const c = await Order.findById(o._id);
  assert.equal(c.total_revenue, 40);
  assert.equal(c.discount, 4);
  assert.equal(c.final_total, round2(40 - 4 + c.delivery_fee));
  const lineProfit = c.products.reduce((s, l) => s + l.total_profit, 0);
  assert.ok(lineProfit > 0);
  assert.equal(c.total_profit, round2(lineProfit - 4));
});

test("admin coupon API: auth, validation, uppercase storage, duplicates, update and delete", async () => {
  const noAuth = await post(t.url, "/api/coupons", { code: "NEW1", type: "percent", value: 5 });
  assert.equal(noAuth.status, 401);

  const create = (data) => admin("/coupons", { method: "POST", body: JSON.stringify(data) });
  const ok = await create({ code: " new1 ", type: "percent", value: 5 });
  assert.equal(ok.status, 201);
  const created = (await ok.json()).data;
  assert.equal(created.code, "NEW1");
  assert.equal(created.used, 0);

  const dup = await create({ code: "new1", type: "fixed", value: 2 });
  assert.ok([400, 409].includes(dup.status));
  assert.match((await dup.json()).message, /[؀-ۿ]/);

  for (const bad of [
    { code: "Z1Z", type: "fixed", value: 0 },
    { code: "Z2Z", type: "percent", value: 101 },
    { code: "Z3Z", type: "other", value: 5 },
    { code: "a b", type: "fixed", value: 5 },
  ]) {
    const r = await create(bad);
    assert.equal(r.status, 400, JSON.stringify(bad));
    assert.match((await r.json()).message, /[؀-ۿ]/);
  }

  const list = await (await admin("/coupons")).json();
  assert.ok(list.data.some((c) => c.code === "NEW1"));

  const put = await admin(`/coupons/${created._id}`, { method: "PUT", body: JSON.stringify({ value: 150, used: 99 }) });
  assert.equal(put.status, 400); // percent > 100 is rejected on edits too
  const put2 = await admin(`/coupons/${created._id}`, { method: "PUT", body: JSON.stringify({ value: 20, active: false, used: 99 }) });
  assert.equal(put2.status, 200);
  const edited = await Coupon.findById(created._id);
  assert.equal(edited.value, 20);
  assert.equal(edited.active, false);
  assert.equal(edited.used, 0); // `used` is not admin-writable

  assert.equal((await admin(`/coupons/${created._id}`, { method: "DELETE" })).status, 200);
  assert.equal((await admin(`/coupons/${created._id}`, { method: "DELETE" })).status, 404);
});

test("a third coupon check from the same client is rate-limited", async () => {
  const server = createApp({ limits: { coupons: { windowMs: 60000, max: 2 } } }).listen(0, "127.0.0.1");
  await once(server, "listening");
  const url = `http://127.0.0.1:${server.address().port}`;
  try {
    const c = () => post(url, "/api/store/coupons/check", { code: "SAVE10", subtotal: 40 });
    assert.equal((await c()).status, 200);
    assert.equal((await c()).status, 200);
    const third = await c();
    assert.equal(third.status, 429);
    assert.match((await third.json()).message, /[؀-ۿ]/);
  } finally {
    await new Promise((r) => server.close(r));
  }
});
