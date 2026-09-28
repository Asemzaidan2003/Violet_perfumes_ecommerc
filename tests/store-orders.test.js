import { test, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { once } from "node:events";
import { startTestApp, loginAs } from "./helpers.js";
import { createApp } from "../backend/app.js";
import Product from "../backend/models/product.model.js";
import Order from "../backend/models/order.model.js";
import Customer from "../backend/models/customer.model.js";
import Interest from "../backend/models/interest.model.js";
import Oil from "../backend/models/oil.model.js";
import Bottle from "../backend/models/bottle.model.js";
import Alcohol from "../backend/models/alcohol.model.js";
import Setting from "../backend/models/setting.model.js";

let t, cookie, ids;

before(async () => {
  t = await startTestApp({ limits: { orders: { max: 1000 }, interest: { max: 1000 } } });
  cookie = await loginAs(t.url);
  await Order.createIndexes(); // rebuild the client_key/public_ref unique indexes dropped by startTestApp's dropDatabase()
});
after(() => t.close());

beforeEach(async () => {
  await Promise.all([Product, Order, Customer, Interest, Oil, Bottle, Alcohol].map((M) => M.deleteMany({})));
  await Oil.create({ id: "OIL1", oil_name: "Test Oil", oil_cost: 0.5, oil_quantity: 100 });
  await Alcohol.create({ name: "Ethanol", type: "perfumer", quantity: 1000, cost: 0.02 });
  const bottle = await Bottle.create({ name: "B30", capacity: 30, cost: 1, quantity: 10 });
  const product = await Product.create({
    p_name: "Test Perfume", p_image: ".", p_category: "Men", oil_id: "OIL1",
    size_list: [{ size: "30", price: 20 }], oil_percentage: 20, alcohol_percentage: 80,
    p_offer_percentage: 10, // final price 18
  });
  const discontinued = await Product.create({
    p_name: "Gone Scent", p_image: ".", p_category: "Men", oil_id: "OIL1",
    size_list: [{ size: "30", price: 10 }], oil_percentage: 20, alcohol_percentage: 80,
    status: "discontinued",
  });
  ids = { product: String(product._id), discontinued: String(discontinued._id), bottle: String(bottle._id) };
});

const customer = (overrides = {}) => ({
  name: "سارة علي", phone: "0791234567", city: "عمّان", address: "شارع الجامعة 12", notes: "", ...overrides,
});
const validBody = (overrides = {}) => ({
  items: [{ product_id: ids.product, size: "30", quantity: 2 }],
  customer: customer(),
  client_key: crypto.randomUUID(),
  ...overrides,
});

const storeApi = (path, body) => fetch(`${t.url}/api/store${path}`, {
  method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
});
const adminApi = (path, init = {}) => fetch(`${t.url}/api${path}`, {
  ...init, headers: { cookie, "Content-Type": "application/json", ...init.headers },
});

test("POST /api/store/orders places an online order priced/costed server-side, with no customer record", async () => {
  const res = await storeApi("/orders", validBody());
  assert.equal(res.status, 201);
  const body = await res.json();
  assert.equal(body.success, true);
  assert.match(body.data.ref, /^[A-Z2-9]{10}$/);
  assert.equal(body.data.subtotal, 36); // 20 * 0.9 (offer) * 2
  assert.equal(body.data.items.length, 1);
  assert.equal(body.data.items[0].price, 18);
  assert.equal(body.data.items[0].line_total, 36);

  const order = await Order.findOne({ public_ref: body.data.ref });
  assert.equal(order.source, "online");
  assert.equal(order.stock_deducted, false);
  assert.equal(order.payment_method, "Cash");
  assert.equal(order.created_by, "online");
  assert.equal(order.delivery.phone, "0791234567");
  assert.equal(order.delivery.city, "عمّان");
  assert.equal(order.customer_id, undefined);
  assert.equal(await Customer.countDocuments(), 0);
  assert.equal((await Oil.findOne({ id: "OIL1" })).oil_quantity, 100);
  assert.equal((await Bottle.findById(ids.bottle)).quantity, 10);
});

test("client-supplied price, bottle_id, delivery_fee, payment_method and customer_id are ignored", async () => {
  const existing = await Customer.create({ name: "Existing", phone: "0790000000" });
  const res = await storeApi("/orders", validBody({
    items: [{ product_id: ids.product, size: "30", quantity: 1, price: 0.01, bottle_id: ids.bottle }],
    delivery_fee: 0, payment_method: "Credit", customer_id: String(existing._id),
  }));
  assert.equal(res.status, 201);
  const body = await res.json();
  assert.equal(body.data.items[0].price, 18);

  const order = await Order.findOne({ public_ref: body.data.ref });
  assert.equal(order.payment_method, "Cash");
  assert.equal(order.customer_id, undefined);
  assert.equal(order.products[0].bottle?.bottle_id, undefined);
});

test("delivery fee comes from settings, and is free at/above the free-delivery threshold", async () => {
  await adminApi("/settings", { method: "PUT", body: JSON.stringify({ delivery_fee: 3, free_delivery_over: 50 }) });

  const under = await storeApi("/orders", validBody({
    client_key: crypto.randomUUID(), items: [{ product_id: ids.product, size: "30", quantity: 1 }],
  }));
  const underBody = await under.json();
  assert.equal(underBody.data.subtotal, 18);
  assert.equal(underBody.data.delivery_fee, 3);
  assert.equal(underBody.data.total, 21);

  const over = await storeApi("/orders", validBody({
    client_key: crypto.randomUUID(), items: [{ product_id: ids.product, size: "30", quantity: 5 }],
  }));
  const overBody = await over.json();
  assert.equal(overBody.data.subtotal, 90);
  assert.equal(overBody.data.delivery_fee, 0);
  assert.equal(overBody.data.total, 90);
});

test("replaying the same client_key returns 200 with the same ref; only one order is stored", async () => {
  const key = crypto.randomUUID();
  const first = await storeApi("/orders", validBody({ client_key: key }));
  assert.equal(first.status, 201);
  const firstBody = await first.json();

  const second = await storeApi("/orders", validBody({ client_key: key }));
  assert.equal(second.status, 200);
  const secondBody = await second.json();
  assert.equal(secondBody.data.ref, firstBody.data.ref);
  assert.equal(await Order.countDocuments(), 1);
});

test("two concurrent requests with the same client_key create exactly one order", async () => {
  const key = crypto.randomUUID();
  const body = validBody({ client_key: key });
  const [a, b] = await Promise.all([storeApi("/orders", body), storeApi("/orders", body)]);
  assert.ok([201, 200].includes(a.status));
  assert.ok([201, 200].includes(b.status));
  const [aBody, bBody] = await Promise.all([a.json(), b.json()]);
  assert.equal(aBody.data.ref, bBody.data.ref);
  assert.equal(await Order.countDocuments(), 1);
});

test("validation rejects bad phone, bad city, too many items, zero quantity, and the honeypot", async () => {
  const cases = [
    validBody({ customer: customer({ phone: "123" }) }),
    validBody({ customer: customer({ city: "القاهرة" }) }),
    validBody({ items: Array.from({ length: 21 }, () => ({ product_id: ids.product, size: "30", quantity: 1 })) }),
    validBody({ items: [{ product_id: ids.product, size: "30", quantity: 0 }] }),
    validBody({ website: "http://spam.example" }),
  ];
  for (const body of cases) {
    const res = await storeApi("/orders", body);
    assert.equal(res.status, 400, JSON.stringify(body));
    const json = await res.json();
    assert.equal(json.success, false);
    assert.match(json.message, /[؀-ۿ]/);
  }
});

test("validation rejects wrong-typed fields: an object name, a boolean quantity, an array quantity", async () => {
  const cases = [
    validBody({ customer: customer({ name: {} }) }),
    validBody({ items: [{ product_id: ids.product, size: "30", quantity: true }] }),
    validBody({ items: [{ product_id: ids.product, size: "30", quantity: [3] }] }),
  ];
  for (const body of cases) {
    const res = await storeApi("/orders", body);
    assert.equal(res.status, 400, JSON.stringify(body));
  }
});

test("`<` and `>` are stripped from customer text fields", async () => {
  const res = await storeApi("/orders", validBody({
    customer: customer({ name: "<b>Sara</b>", address: "<script>street</script> 12", notes: "<i>note</i>" }),
  }));
  assert.equal(res.status, 201);
  const { data } = await res.json();
  const order = await Order.findOne({ public_ref: data.ref });
  assert.equal(order.delivery.name, "bSara/b");
  assert.equal(order.delivery.address, "scriptstreet/script 12");
  assert.equal(order.delivery.notes, "inote/i");
});

test("Arabic-Indic phone digits are accepted", async () => {
  const res = await storeApi("/orders", validBody({ customer: customer({ phone: "٠٧٩١٢٣٤٥٦٧" }) }));
  assert.equal(res.status, 201);
});

test("a coupon failure at order time returns field: 'coupon'; a non-coupon 400 has no field", async () => {
  const couponRes = await storeApi("/orders", validBody({ coupon: "NOPE", client_key: crypto.randomUUID() }));
  assert.equal(couponRes.status, 400);
  const couponBody = await couponRes.json();
  assert.equal(couponBody.field, "coupon");

  const plainRes = await storeApi("/orders", validBody({ customer: customer({ phone: "123" }) }));
  assert.equal(plainRes.status, 400);
  const plainBody = await plainRes.json();
  assert.equal(plainBody.field, undefined);
});

test("ordering a discontinued product is 404", async () => {
  const res = await storeApi("/orders", validBody({ items: [{ product_id: ids.discontinued, size: "30", quantity: 1 }] }));
  assert.equal(res.status, 404);
});

test("a third order from the same client is rate-limited with a WhatsApp link in the message", async () => {
  // Its own app instance (fresh limiter buckets), same shared mongoose connection as `t`.
  const rlApp = createApp({ limits: { orders: { max: 2 }, interest: { max: 1000 } } });
  const server = rlApp.listen(0, "127.0.0.1");
  await once(server, "listening");
  const url = `http://127.0.0.1:${server.address().port}`;
  try {
    const put = await fetch(`${url}/api/settings`, {
      method: "PUT", headers: { cookie, "Content-Type": "application/json" },
      body: JSON.stringify({ whatsapp: "962791234567" }),
    });
    assert.equal(put.status, 200);

    const place = () => fetch(`${url}/api/store/orders`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(validBody({ client_key: crypto.randomUUID() })),
    });
    assert.equal((await place()).status, 201);
    assert.equal((await place()).status, 201);
    const third = await place();
    assert.equal(third.status, 429);
    const body = await third.json();
    assert.match(body.message, /wa\.me\/962791234567/);
  } finally {
    await new Promise((r) => server.close(r));
  }
});

test("the interest rate-limit message reflects the WhatsApp number with no order ever placed, and updates after a settings change", async () => {
  const rlApp = createApp({ limits: { orders: { max: 1000 }, interest: { max: 2 } } });
  const server = rlApp.listen(0, "127.0.0.1");
  await once(server, "listening");
  const url = `http://127.0.0.1:${server.address().port}`;
  try {
    // A freshly booted shop that already has a WhatsApp number configured, written directly
    // (bypassing saveSettings) so this doesn't itself warm the process-wide settings cache.
    await Setting.findByIdAndUpdate("shop", { $set: { whatsapp: "962700000001" } }, { upsert: true });

    const interest = (phone) => fetch(`${url}/api/store/interest`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ product_id: ids.product, name: "لينا", phone }),
    });
    assert.equal((await interest("0791111111")).status, 201);
    assert.equal((await interest("0792222222")).status, 201);
    const blocked = await interest("0793333333");
    assert.equal(blocked.status, 429);
    assert.match((await blocked.json()).message, /wa\.me\/962700000001/);

    const put = await fetch(`${url}/api/settings`, {
      method: "PUT", headers: { cookie, "Content-Type": "application/json" },
      body: JSON.stringify({ whatsapp: "962700000002" }),
    });
    assert.equal(put.status, 200);

    const blockedAgain = await interest("0794444444");
    assert.equal(blockedAgain.status, 429);
    assert.match((await blockedAgain.json()).message, /wa\.me\/962700000002/);
  } finally {
    await new Promise((r) => server.close(r));
  }
});

test("admin confirm links an existing customer by normalized phone and applies a delivery_fee edit", async () => {
  const existing = await Customer.create({ name: "Sara (existing)", phone: "0791234567" });
  const placeRes = await storeApi("/orders", validBody());
  const { data } = await placeRes.json();
  const order = await Order.findOne({ public_ref: data.ref });

  const confirmRes = await adminApi(`/orders/${order._id}/confirm`, {
    method: "POST", body: JSON.stringify({ lines: [{ bottle_id: ids.bottle }], delivery_fee: 3 }),
  });
  assert.equal(confirmRes.status, 200);
  const confirmBody = await confirmRes.json();
  assert.equal(String(confirmBody.data.customer_id), String(existing._id));
  assert.equal(await Customer.countDocuments(), 1); // no new customer created
  assert.equal(confirmBody.data.delivery_fee, 3);
  assert.equal(confirmBody.data.final_total, confirmBody.data.total_revenue + 3);
});

test("admin confirm creates a new customer when none matches the delivery phone", async () => {
  const placeRes = await storeApi("/orders", validBody({ customer: customer({ phone: "0798765432" }) }));
  const { data } = await placeRes.json();
  const order = await Order.findOne({ public_ref: data.ref });

  const confirmRes = await adminApi(`/orders/${order._id}/confirm`, {
    method: "POST", body: JSON.stringify({ lines: [{ bottle_id: ids.bottle }] }),
  });
  assert.equal(confirmRes.status, 200);
  const created = await Customer.findOne({ phone: "0798765432" });
  assert.ok(created);
  assert.equal(String((await confirmRes.json()).data.customer_id), String(created._id));
});

test("admin confirm sets a newly-created customer's address to 'city — address'", async () => {
  const placeRes = await storeApi("/orders", validBody({
    customer: customer({ phone: "0799999999", city: "إربد", address: "شارع 5" }),
  }));
  const { data } = await placeRes.json();
  const order = await Order.findOne({ public_ref: data.ref });

  await adminApi(`/orders/${order._id}/confirm`, {
    method: "POST", body: JSON.stringify({ lines: [{ bottle_id: ids.bottle }] }),
  });
  const created = await Customer.findOne({ phone: "0799999999" });
  assert.equal(created.address, "إربد — شارع 5");
});

test("confirm with delivery_fee: '' keeps the existing fee; a negative or non-numeric value is 400", async () => {
  const placeRes = await storeApi("/orders", validBody());
  const { data } = await placeRes.json();
  const order = await Order.findOne({ public_ref: data.ref });
  const originalFee = order.delivery_fee;

  const bad1 = await adminApi(`/orders/${order._id}/confirm`, {
    method: "POST", body: JSON.stringify({ lines: [{ bottle_id: ids.bottle }], delivery_fee: -1 }),
  });
  assert.equal(bad1.status, 400);
  const bad2 = await adminApi(`/orders/${order._id}/confirm`, {
    method: "POST", body: JSON.stringify({ lines: [{ bottle_id: ids.bottle }], delivery_fee: "abc" }),
  });
  assert.equal(bad2.status, 400);

  const confirmRes = await adminApi(`/orders/${order._id}/confirm`, {
    method: "POST", body: JSON.stringify({ lines: [{ bottle_id: ids.bottle }], delivery_fee: "" }),
  });
  assert.equal(confirmRes.status, 200);
  assert.equal((await confirmRes.json()).data.delivery_fee, originalFee);
});

test("POST /api/store/interest creates a request; a duplicate while 'new' updates it instead of duplicating", async () => {
  const body = { product_id: ids.product, size: "30", name: "لينا", phone: "0791234567", note: "متوفر قريبًا؟" };
  const first = await storeApi("/interest", body);
  assert.equal(first.status, 201);
  assert.deepEqual(await first.json(), { success: true });

  const second = await storeApi("/interest", { ...body, note: "لسه؟" });
  assert.equal(second.status, 201);
  assert.equal(await Interest.countDocuments(), 1);
  assert.equal((await Interest.findOne()).note, "لسه؟");
});

test("interest for a discontinued product is 404", async () => {
  const res = await storeApi("/interest", { product_id: ids.discontinued, name: "لينا", phone: "0791234567" });
  assert.equal(res.status, 404);
});

test("interest validation rejects a bad phone and the honeypot", async () => {
  const badPhone = await storeApi("/interest", { product_id: ids.product, name: "لينا", phone: "123" });
  assert.equal(badPhone.status, 400);

  const honeypot = await storeApi("/interest", {
    product_id: ids.product, name: "لينا", phone: "0791234567", website: "http://spam.example",
  });
  assert.equal(honeypot.status, 400);
});

test("interest with a size that doesn't exist on the product is 400", async () => {
  const res = await storeApi("/interest", { product_id: ids.product, size: "999", name: "لينا", phone: "0791234567" });
  assert.equal(res.status, 400);
});

test("interest with an overlong size string is 400", async () => {
  const res = await storeApi("/interest", {
    product_id: ids.product, size: "x".repeat(21), name: "لينا", phone: "0791234567",
  });
  assert.equal(res.status, 400);
});

test("admin can list interests by status and update status", async () => {
  await Interest.create({ product_id: ids.product, product_name: "Test Perfume", name: "لينا", phone: "0791234567", status: "new" });

  const list = await adminApi("/interests");
  assert.equal(list.status, 200);
  const listBody = await list.json();
  assert.equal(listBody.data.length, 1);
  assert.equal(listBody.data[0].status, "new");

  const id = listBody.data[0]._id;
  const upd = await adminApi(`/interests/${id}`, { method: "PUT", body: JSON.stringify({ status: "contacted" }) });
  assert.equal(upd.status, 200);
  assert.equal((await upd.json()).data.status, "contacted");

  const filtered = await adminApi("/interests?status=new");
  assert.equal((await filtered.json()).data.length, 0);
});

test("GET /api/interests?status=bogus is 400", async () => {
  const res = await adminApi("/interests?status=bogus");
  assert.equal(res.status, 400);
});

test("the order response body exposes no internal fields", async () => {
  const res = await storeApi("/orders", validBody());
  const { data } = await res.json();
  const serialized = JSON.stringify(data);
  for (const key of ["_id", "total_cost", "total_profit", "oil"]) {
    assert.ok(!new RegExp(`"${key}"`).test(serialized), `unexpected key "${key}" in response`);
  }
});

test("POST /api/customers normalizes the phone, so confirm-time matching finds a POS-created customer", async () => {
  const create = await adminApi("/customers", {
    method: "POST", body: JSON.stringify({ name: "Sara POS", phone: "٠٧٩١٢٣٤٥٦٧" }),
  });
  assert.equal(create.status, 201);
  const created = await create.json();
  assert.equal(created.phone, "0791234567");

  const placeRes = await storeApi("/orders", validBody({ customer: customer({ phone: "0791234567" }) }));
  const { data } = await placeRes.json();
  const order = await Order.findOne({ public_ref: data.ref });
  const confirmRes = await adminApi(`/orders/${order._id}/confirm`, {
    method: "POST", body: JSON.stringify({ lines: [{ bottle_id: ids.bottle }] }),
  });
  assert.equal((await confirmRes.json()).data.customer_id, created._id);
  assert.equal(await Customer.countDocuments(), 1); // no second customer created
});

test("PUT /api/customers/:id also normalizes the phone", async () => {
  const create = await adminApi("/customers", { method: "POST", body: JSON.stringify({ name: "Existing", phone: "0790000000" }) });
  const created = await create.json();

  const upd = await adminApi(`/customers/${created._id}`, {
    method: "PUT", body: JSON.stringify({ phone: "+962 79 111 2222" }),
  });
  assert.equal(upd.status, 200);
  assert.equal((await upd.json()).phone, "0791112222");
});
