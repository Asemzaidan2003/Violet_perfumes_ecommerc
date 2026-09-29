// New React admin orders list. registerAdminOrdersScenarios({ scenario, openPage, check, baseUrl, admin })
import assert from "node:assert/strict";
import crypto from "node:crypto";
import Bottle from "../../backend/models/bottle.model.js";
import Customer from "../../backend/models/customer.model.js";
import Order from "../../backend/models/order.model.js";
import Product from "../../backend/models/product.model.js";
import { invalidateCatalog } from "../../backend/store/catalog.js";
import { assertPageIsXssSafe, noSideScroll, openAdmin } from "./admin-helpers.mjs";

const line = (productId, name) => ({
  product_id: productId, p_name: name, product_size: "30", quantity: 1,
  selling_price: 22, total_revenue: 22, oil_id: "OIL1", oil_ml: 6, alcohol_ml: 24,
});

async function placeOnlineOrder(baseUrl, { productId, name, phone, size = "30" }) {
  const res = await fetch(`${baseUrl}/api/store/orders`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      items: [{ product_id: productId, size, quantity: 1 }],
      customer: { name, phone, city: "عمّان", address: "شارع الجامعة 12", notes: "" },
      client_key: crypto.randomUUID(),
    }),
  });
  const body = await res.json().catch(() => null);
  assert.equal(res.status, 201, `order placement failed: ${JSON.stringify(body)}`);
  return body.data;
}

const seedProduct = (p_name) => Product.create({
  p_name, p_image: ".", p_category: "Men", oil_id: "OIL1", oil_percentage: 20, alcohol_percentage: 80,
  size_list: [{ size: "30", price: 22 }],
});

const posOrder = (product, customer) => Order.create({
  products: [line(product._id, product.p_name)], total_items: 1, total_revenue: 22, total_cost: 5, total_profit: 17,
  payment_method: "Cash", delivery_fee: 0, final_total: 22, status: "completed", created_by: "admin", source: "pos",
  stock_deducted: true, customer_id: customer._id,
});

export async function registerAdminOrdersScenarios({ scenario, openPage, check, baseUrl, admin }) {
  await scenario("Orders page (new admin): today's default, filters, status change", async () => {
    const product = await seedProduct("عطر اختبار الطلبات");
    invalidateCatalog();
    const customer = await Customer.create({ name: "زبون طلبات كاشير", phone: "0797770001", type: "individual" });
    const seeded = await posOrder(product, customer);
    const online = await placeOnlineOrder(baseUrl, { productId: String(product._id), name: "زبون طلبات أونلاين", phone: "0797770002" });
    try {
      const page = await openPage();
      await page.setViewportSize({ width: 1440, height: 900 });
      await openAdmin(page, baseUrl, admin, "/orders");
      const posRow = page.locator("tr", { hasText: "زبون طلبات كاشير" });
      const onlineRow = page.locator("tr", { hasText: "زبون طلبات أونلاين" });
      await posRow.waitFor();
      await onlineRow.waitFor();
      await page.getByText("اليوم", { exact: true }).waitFor();
      await onlineRow.getByText("الموقع", { exact: true }).waitFor();
      await onlineRow.getByText("بانتظار التأكيد", { exact: true }).waitFor();
      assert.equal(await posRow.getByText("الموقع", { exact: true }).count(), 0);
      assert.equal(await onlineRow.locator('a[href^="https://wa.me/"]').count(), 1, "online order with a phone gets a WhatsApp link");
      assert.equal(await posRow.locator('a[href^="https://wa.me/"]').count(), 0, "POS orders get none");

      // Apply the unconfirmed filter; Enter in the search box applies too.
      await page.selectOption("#f-status", "unconfirmed");
      await page.getByRole("button", { name: "فلترة" }).click();
      await onlineRow.waitFor();
      await posRow.waitFor({ state: "detached" }); // unconfirmed filter hides the completed POS order
      await page.getByRole("button", { name: "إعادة تعيين" }).click();
      await posRow.waitFor();
      await onlineRow.waitFor();
      await page.fill("#f-query", "كاشير");
      await page.press("#f-query", "Enter");
      await posRow.waitFor();
      await onlineRow.waitFor({ state: "detached" });
      await page.getByRole("button", { name: "إعادة تعيين" }).click();
      await onlineRow.waitFor();

      // A confirmed order moves freely.
      await page.getByLabel("حالة طلب زبون طلبات كاشير").selectOption("ready for delivery");
      await page.getByText("تم تحديث حالة الطلب").waitFor();
      assert.equal((await Order.findById(seeded._id)).status, "ready for delivery");

      // An unconfirmed online order may not: the server's Arabic 409 reaches the toast and the select reverts.
      const onlineSelect = page.getByLabel("حالة طلب زبون طلبات أونلاين");
      await onlineSelect.selectOption("completed");
      await page.getByText("يرجى تأكيد الطلب من نقطة البيع أولًا").waitFor();
      await page.waitForFunction((el) => el.value === "pending", await onlineSelect.elementHandle());
      assert.equal((await Order.findOne({ public_ref: online.ref })).status, "pending");

      // Canceling asks first; dismissing changes nothing, confirming cancels.
      await onlineSelect.selectOption("canceled");
      const dialog = page.getByRole("alertdialog");
      await dialog.waitFor();
      await dialog.getByRole("button", { name: "إلغاء", exact: true }).click();
      await dialog.waitFor({ state: "detached" });
      assert.equal((await Order.findOne({ public_ref: online.ref })).status, "pending");
      await onlineSelect.selectOption("canceled");
      await dialog.getByRole("button", { name: "إلغاء الطلب" }).click();
      await page.waitForFunction(async (ref) => (await (await fetch("/api/orders")).json()).data.find((o) => o.public_ref === ref)?.status === "canceled", online.ref);
      await onlineRow.getByText("بانتظار التأكيد", { exact: true }).waitFor({ state: "detached" }); // a canceled order is no longer unconfirmed
      assert.equal(await noSideScroll(page), true);
      // The browser logs the deliberate 409 above; anything else is noise.
      assert.deepEqual(page.errors.filter((e) => !/status of 409/.test(e)), []);
    } finally {
      await Order.deleteMany({ $or: [{ _id: seeded._id }, { public_ref: online.ref }] });
      await Customer.deleteMany({ phone: { $in: ["0797770001", "0797770002"] } });
      await Product.deleteOne({ _id: product._id });
      invalidateCatalog();
    }
  });

  await scenario("Orders page (new admin): phone layout", async () => {
    const product = await seedProduct("عطر طلبات الهاتف");
    invalidateCatalog();
    const customer = await Customer.create({ name: "زبون طلبات الهاتف", phone: "0797770003", type: "individual" });
    const seeded = await posOrder(product, customer);
    const online = await placeOnlineOrder(baseUrl, { productId: String(product._id), name: "زبون هاتف أونلاين", phone: "0797770004" });
    try {
      const page = await openPage({ mobile: true });
      await openAdmin(page, baseUrl, admin, "/orders");
      const card = page.locator("li", { hasText: "زبون طلبات الهاتف" });
      await card.waitFor();
      assert.equal(await page.locator("table").count(), 0, "cards, not a table, on a phone");
      assert.equal(await noSideScroll(page), true, "no sideways scroll");
      const small = await page.evaluate(() => [...document.querySelectorAll("main a, main button, main select, main input")]
        .map((el) => [el, el.getBoundingClientRect()]).filter(([, r]) => r.width > 0 && r.height > 0 && r.height < 44)
        .map(([el]) => `${el.tagName} ${el.getAttribute("aria-label") || el.textContent.trim().slice(0, 20)}`));
      assert.deepEqual(small, [], "every control is at least 44px tall");

      // The filter panel is collapsed behind a button; the deep link preselects and applies it.
      assert.equal(await page.locator("#f-status").isVisible(), false);
      await page.goto(`${baseUrl}/admin/orders?filter=unconfirmed`);
      const onlineCard = page.locator("li", { hasText: "زبون هاتف أونلاين" });
      await onlineCard.waitFor();
      assert.equal(await page.locator("li", { hasText: "زبون طلبات الهاتف" }).count(), 0);
      assert.equal(await page.getByText("اليوم", { exact: true }).count(), 0, "a deep link shows all orders, not just today");
      const toggle = page.getByRole("button", { name: /الفلاتر/ });
      assert.match(await toggle.innerText(), /1/, "active-filter count is shown");
      await toggle.click();
      assert.equal(await page.inputValue("#f-status"), "unconfirmed");
      assert.equal(await noSideScroll(page), true);
      check(page);
    } finally {
      await Order.deleteMany({ $or: [{ _id: seeded._id }, { public_ref: online.ref }] });
      await Customer.deleteMany({ phone: { $in: ["0797770003", "0797770004"] } });
      await Product.deleteOne({ _id: product._id });
      invalidateCatalog();
    }
  });

  await scenario("Orders page (new admin): hostile names are inert", async () => {
    const PAYLOAD = `"><img src=x onerror=window.__xss=1>`;
    const product = await seedProduct("عطر طلبات XSS");
    invalidateCatalog();
    // Straight into the DB: the public API strips < and >, but the admin must not rely on that.
    const order = await Order.create({
      products: [line(product._id, product.p_name)], total_items: 1, total_revenue: 22, total_cost: 0, total_profit: 0,
      payment_method: "Cash", delivery_fee: 0, final_total: 22, status: "pending", created_by: "online", source: "online",
      stock_deducted: false, public_ref: crypto.randomUUID(), client_key: crypto.randomUUID(),
      delivery: { name: PAYLOAD, phone: "0781234567", city: "إربد", address: "x", notes: "" },
    });
    try {
      const page = await openPage();
      await page.setViewportSize({ width: 1440, height: 900 });
      await openAdmin(page, baseUrl, admin, "/orders");
      await assertPageIsXssSafe(page, [PAYLOAD]);
      assert.ok(await page.locator('a[href="https://wa.me/962781234567"]').count() >= 1, "WhatsApp link points at the normalised number");
      check(page);
    } finally {
      await Order.deleteOne({ _id: order._id });
      await Product.deleteOne({ _id: product._id });
      invalidateCatalog();
    }
  });

  // ---- Order details ----
  const pendingCount = (page) => page.evaluate(async () => (await (await fetch("/api/orders/pending-count")).json()).data.count);
  const seedProductSized = (p_name, size) => Product.create({
    p_name, p_image: ".", p_category: "Men", oil_id: "OIL1", oil_percentage: 20, alcohol_percentage: 80,
    size_list: [{ size, price: 22 }],
  });
  const dbOnline = (product, size, extra = {}) => Order.create({
    products: [{ ...line(product._id, product.p_name), product_size: size }], total_items: 1, total_revenue: 22, total_cost: 0, total_profit: 0,
    payment_method: "Cash", delivery_fee: 0, final_total: 22, status: "pending", created_by: "online", source: "online",
    stock_deducted: false, public_ref: crypto.randomUUID(), client_key: crypto.randomUUID(),
    delivery: { name: "زبون تفاصيل", phone: "0781234567", city: "إربد", address: "x", notes: "" }, ...extra,
  });
  const waitConfirm = (page, id) => page.waitForResponse((r) => r.url().endsWith(`/orders/${id}/confirm`) && r.request().method() === "POST");

  await scenario("Order details (new admin): confirm an online order", async () => {
    const product = await seedProductSized("عطر تفاصيل الطلب", "37");
    invalidateCatalog();
    const bottle = await Bottle.create({ name: "زجاجة تفاصيل 37", capacity: 37, cost: 0.2, quantity: 50 });
    const other = await Bottle.create({ name: "زجاجة غير مناسبة 41", capacity: 41, cost: 0.2, quantity: 50 });
    const placed = await placeOnlineOrder(baseUrl, { productId: String(product._id), name: "زبون تفاصيل أونلاين", phone: "0797770011", size: "37" });
    const order = await Order.findOne({ public_ref: placed.ref });
    try {
      const page = await openPage();
      await page.setViewportSize({ width: 1440, height: 900 });
      await openAdmin(page, baseUrl, admin, `/orders/${order._id}`);
      await page.waitForSelector("#deliveryInfo");
      const info = await page.locator("#deliveryInfo").innerText();
      assert.match(info, /زبون تفاصيل أونلاين/);
      assert.match(info, /عمّان/);
      assert.match(info, /شارع الجامعة 12/);
      assert.equal(await page.locator('#deliveryInfo a[href^="https://wa.me/962"]').count(), 1);
      assert.equal(await page.inputValue("#deliveryFeeInput"), String(placed.delivery_fee));
      await page.getByText("بانتظار التأكيد").first().waitFor();
      const opts = await page.locator("#bottle-0 option").allTextContents();
      assert.equal(opts.length, 2, "placeholder plus the one bottle of capacity 37");
      assert.match(opts[1], /زجاجة تفاصيل 37 \(المتوفر: 50\)/);
      const before = await pendingCount(page);
      await page.selectOption("#bottle-0", String(bottle._id));
      const confirmed = waitConfirm(page, order._id);
      await page.click("#confirmBtn");
      assert.equal((await confirmed).status(), 200);
      await page.getByText("تم الخصم", { exact: true }).waitFor();
      assert.equal(await page.locator("#confirmBtn").count(), 0, "read-only after confirm");
      const stored = await Order.findById(order._id);
      assert.equal(stored.stock_deducted, true);
      assert.ok(stored.customer_id, "a customer was linked");
      assert.equal(await pendingCount(page), before - 1);
      check(page);
    } finally {
      await Order.deleteOne({ _id: order._id });
      await Customer.deleteMany({ phone: "0797770011" });
      await Bottle.deleteMany({ _id: { $in: [bottle._id, other._id] } });
      await Product.deleteOne({ _id: product._id });
      invalidateCatalog();
    }
  });

  await scenario("Order details (new admin): confirm needs a bottle and reports shortages", async () => {
    const product = await seedProductSized("عطر نقص المخزون", "43");
    const empty = await Bottle.create({ name: "زجاجة فارغة 43", capacity: 43, cost: 0.2, quantity: 0 });
    const order = await dbOnline(product, "43");
    try {
      const page = await openPage();
      await page.setViewportSize({ width: 1440, height: 900 });
      let posts = 0;
      page.on("request", (r) => { if (r.method() === "POST" && r.url().includes("/confirm")) posts += 1; });
      await openAdmin(page, baseUrl, admin, `/orders/${order._id}`);
      await page.waitForSelector("#confirmBtn");
      await page.click("#confirmBtn");
      await page.getByText("يرجى اختيار زجاجة لكل منتج").waitFor();
      assert.equal(posts, 0, "no request without a bottle");
      await page.selectOption("#bottle-0", String(empty._id));
      const confirmed = waitConfirm(page, order._id);
      await page.click("#confirmBtn");
      assert.equal((await confirmed).status(), 200);
      const warn = page.getByRole("alert").filter({ hasText: "المخزون غير كافٍ" });
      await warn.waitFor();
      const text = await warn.innerText();
      assert.match(text, /بالسالب/);
      assert.doesNotMatch(text, /تصفيرها/);
      assert.match(text, /المطلوب/);
      assert.match(text, /المتوفر/);
      await page.getByText("تم الخصم", { exact: true }).waitFor();
      assert.equal(posts, 1);
      check(page);
    } finally {
      await Order.deleteOne({ _id: order._id });
      await Customer.deleteMany({ phone: "0781234567" });
      await Bottle.deleteOne({ _id: empty._id });
      await Product.deleteOne({ _id: product._id });
    }
  });

  await scenario("Order details (new admin): hostile strings are inert", async () => {
    const A = `"><img src=x onerror=window.__xss=1>`;
    const B = `<svg onload=window.__xss=2>`;
    const C = `a & b 'q' <b>x</b>`;
    const D = `" onmouseover=window.__xss=5 x="`;
    const bottle = await Bottle.create({ name: C, capacity: 55, cost: 0.2, quantity: 20 });
    const product = await seedProductSized("عطر تفاصيل XSS", "55");
    const order = await dbOnline(product, "55", {
      order_notes: D, delivery: { name: A, phone: "0781234567", city: "إربد", address: B, notes: C },
    });
    await Order.updateOne({ _id: order._id }, { "products.0.p_name": B });
    try {
      const page = await openPage();
      await page.setViewportSize({ width: 1440, height: 900 });
      await openAdmin(page, baseUrl, admin, `/orders/${order._id}`);
      await page.waitForSelector("#deliveryInfo");
      await assertPageIsXssSafe(page, [A, B, C, D]);
      assert.ok((await page.locator("#bottle-0 option").last().textContent()).includes(C));
      await page.selectOption("#bottle-0", String(bottle._id));
      const confirmed = waitConfirm(page, order._id);
      await page.click("#confirmBtn");
      assert.equal((await confirmed).status(), 200);
      await page.getByText("تم الخصم", { exact: true }).waitFor();
      await assertPageIsXssSafe(page, [A, B, C, D]);
      check(page);
    } finally {
      await Order.deleteOne({ _id: order._id });
      await Customer.deleteMany({ phone: "0781234567" });
      await Bottle.deleteOne({ _id: bottle._id });
      await Product.deleteOne({ _id: product._id });
    }
  });

  await scenario("Order details (new admin): missing and malformed ids", async () => {
    const page = await openPage();
    await openAdmin(page, baseUrl, admin, "/orders/000000000000000000000000");
    await page.getByRole("alert").getByText("الطلب غير موجود").waitFor();
    await page.goto(`${baseUrl}/admin/orders/not-an-id`);
    await page.getByRole("alert").getByText("Invalid id").waitFor();
    assert.equal(await page.getByRole("link", { name: "الرجوع إلى الطلبات" }).count(), 1);
    assert.deepEqual(page.errors.filter((e) => !/status of (404|400)/.test(e)), []);
  });

  await scenario("Order details (new admin): phone layout", async () => {
    const product = await seedProductSized("عطر تفاصيل الهاتف", "47");
    const bottle = await Bottle.create({ name: "زجاجة هاتف 47", capacity: 47, cost: 0.2, quantity: 9 });
    const order = await dbOnline(product, "47");
    try {
      const page = await openPage({ mobile: true });
      await openAdmin(page, baseUrl, admin, `/orders/${order._id}`);
      await page.waitForSelector("#confirmBtn");
      assert.equal(await page.locator("table").count(), 0, "cards, not a table, on a phone");
      assert.equal(await noSideScroll(page), true);
      const small = await page.evaluate(() => [...document.querySelectorAll("main a, main button, main select, main input")]
        .map((el) => [el, el.getBoundingClientRect()]).filter(([, r]) => r.width > 0 && r.height > 0 && r.height < 44)
        .map(([el]) => `${el.tagName} ${el.id || el.textContent.trim().slice(0, 20)}`));
      assert.deepEqual(small, []);
      check(page);
    } finally {
      await Order.deleteOne({ _id: order._id });
      await Bottle.deleteOne({ _id: bottle._id });
      await Product.deleteOne({ _id: product._id });
    }
  });
}
