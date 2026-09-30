// Task 7 admin scenarios (interests, settings, online-order confirmation, escaping, the
// new-order badge) — kept in their own module so run.mjs stays small and this file can be
// merged independently of whatever an earlier task's own storefront-checkout scenario adds.
//
// Call registerAdminOnlineScenarios({ scenario, openPage, check, baseUrl }) from run.mjs, after
// the server is listening. Every assertion here reads real state (the live unconfirmed-order
// count, the settings actually saved) instead of hard-coding numbers, so these scenarios pass
// regardless of what other scenarios ran before them, in any order.
import assert from "node:assert/strict";
import crypto from "node:crypto";
import Bottle from "../../backend/models/bottle.model.js";
import Customer from "../../backend/models/customer.model.js";
import Interest from "../../backend/models/interest.model.js";
import Order from "../../backend/models/order.model.js";
import Product from "../../backend/models/product.model.js";

const WA_HREF_RE = /^https:\/\/wa\.me\/962\d{9}$/;

// Reads the unconfirmed-order count the same way navbar.js does, through an already-logged-in
// page's own fetch (GET /api/orders is admin-only).
async function unconfirmedCount(page) {
  return page.evaluate(async () => {
    const res = await fetch("/api/orders");
    const { data } = await res.json();
    return data.filter((o) => o.stock_deducted === false && o.status !== "canceled").length;
  });
}

// The one assertion that would have caught the "badge always shows 0" bug: compares the real
// count against what the badge actually displays (hidden when 0, the right digit otherwise),
// rather than assuming a specific number.
async function assertBadgeConsistent(page) {
  const expected = await unconfirmedCount(page);
  const badge = page.locator("#navOrdersBadge");
  if (expected === 0) {
    assert.ok(await badge.isHidden(), "badge should be hidden when there are no unconfirmed orders");
  } else {
    assert.equal(await badge.isHidden(), false, "badge should be visible when there are unconfirmed orders");
    assert.equal(await badge.innerText(), String(expected));
    assert.match(await page.title(), new RegExp(`^\\(${expected}\\) `));
  }
  return expected;
}

async function placeOnlineOrder(baseUrl, { productId, size, name, phone, city, address, notes }) {
  const res = await fetch(`${baseUrl}/api/store/orders`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      items: [{ product_id: productId, size, quantity: 1 }],
      customer: { name, phone, city, address, notes },
      client_key: crypto.randomUUID(),
    }),
  });
  const body = await res.json().catch(() => null);
  assert.equal(res.status, 201, `order placement failed: ${JSON.stringify(body)}`);
  return body.data;
}

async function findOrderIdByRef(page, ref) {
  const id = await page.evaluate(async (r) => {
    const res = await fetch("/api/orders");
    const { data } = await res.json();
    return data.find((o) => o.public_ref === r)?._id;
  }, ref);
  assert.ok(id, `no order found for ref ${ref}`);
  return id;
}

// Checked on every admin page a hostile payload could reach: no script ran, nothing was
// stripped (the literal payload text is still visible — proof it was escaped, not sanitized
// away upstream), no hostile element was actually created, and every WhatsApp link still
// points at a clean wa.me URL.
async function assertPageIsXssSafe(page, mustContainTexts) {
  assert.equal(await page.evaluate(() => window.__xss), undefined, `window.__xss set on ${page.url()}`);
  assert.equal(
    await page.locator("img[onerror], svg[onload], [onmouseover]").count(), 0,
    `a hostile element rendered on ${page.url()}`
  );
  const bodyText = await page.locator("body").innerText();
  for (const text of mustContainTexts) {
    assert.ok(bodyText.includes(text), `expected literal text ${JSON.stringify(text)} on ${page.url()}`);
  }
  const waHrefs = await page.locator('a[href^="https://wa.me/"]').evaluateAll((els) => els.map((el) => el.getAttribute("href")));
  for (const href of waHrefs) assert.match(href, WA_HREF_RE, `bad wa.me href ${href} on ${page.url()}`);
}

export async function registerAdminOnlineScenarios({ scenario, openPage, check, baseUrl }) {
  await scenario("Settings round trip", async () => {
    const page = await openPage();
    await page.goto(`${baseUrl}/admin/html/settings.html`);
    await page.waitForLoadState("networkidle");
    assert.equal(await page.isDisabled("#saveBtn"), false, "save should enable once settings finish loading");
    await assertBadgeConsistent(page); // exercises the [hidden] CSS fix regardless of the real count

    await page.fill("#whatsapp", "962791234567");
    await page.fill("#instagram", "https://instagram.com/nsamat");
    await page.fill("#delivery_fee", "3");
    await page.fill("#free_delivery_over", "0");
    const saved = page.waitForResponse((r) => r.url().endsWith("/api/settings") && r.request().method() === "PUT");
    await page.click("#settingsForm button[type=submit]");
    assert.equal((await saved).status(), 200);
    await page.locator("#success:not([hidden])").waitFor();
    assert.equal(await page.getAttribute("#success", "role"), "status");
    check(page);

    await page.reload();
    await page.waitForLoadState("networkidle");
    assert.equal(await page.inputValue("#whatsapp"), "962791234567");
    assert.equal(await page.inputValue("#instagram"), "https://instagram.com/nsamat");
    assert.equal(await page.inputValue("#delivery_fee"), "3");
    assert.equal(await page.inputValue("#free_delivery_over"), "0");

    // Inline server error: an invalid value is rejected without crashing the page. (A negative
    // delivery_fee can't be used here — the number input's own min="0" blocks submission client-side.)
    // A fresh page, because Edge itself logs a devtools "Failed to load resource" console entry for
    // any non-2xx fetch response — expected noise here, not checked by check().
    const errorPage = await openPage();
    await errorPage.goto(`${baseUrl}/admin/html/settings.html`);
    await errorPage.waitForLoadState("networkidle");
    await errorPage.fill("#whatsapp", "not-a-number");
    const rejected = errorPage.waitForResponse((r) => r.url().endsWith("/api/settings") && r.request().method() === "PUT");
    await errorPage.click("#settingsForm button[type=submit]");
    assert.equal((await rejected).status(), 400);
    await errorPage.locator("#error:not([hidden])").waitFor();
  });

  await scenario("Admin sees the online order", async () => {
    const onlineProduct = await Product.create({
      p_name: "عطر طلب أونلاين", p_image: "https://example.com/online.jpg", p_category: "Men",
      oil_id: "OIL1", oil_percentage: 20, alcohol_percentage: 80, size_list: [{ size: "30", price: 22 }],
    });

    const ordersPage = await openPage();
    await ordersPage.goto(`${baseUrl}/admin/html/orders.html`);
    await ordersPage.waitForLoadState("networkidle");
    const before = await assertBadgeConsistent(ordersPage);

    const placed = await placeOnlineOrder(baseUrl, {
      productId: onlineProduct._id.toString(), size: "30", name: "زبون الموقع", phone: "0791234567",
      city: "عمّان", address: "شارع الجامعة 12", notes: "الرجاء الاتصال قبل التوصيل",
    });

    await ordersPage.reload();
    await ordersPage.waitForLoadState("networkidle");
    const after = await assertBadgeConsistent(ordersPage);
    assert.equal(after, before + 1, "placing one online order should add exactly one unconfirmed order");

    // I3: scope the source badge to this order's own row, not just "somewhere on the page".
    const row = ordersPage.locator("tr", { hasText: "زبون الموقع" });
    await row.first().waitFor();
    await row.locator("span.badge", { hasText: "الموقع" }).first().waitFor();

    const orderId = await findOrderIdByRef(ordersPage, placed.ref);
    check(ordersPage);

    const detailsPage = await openPage();
    await detailsPage.goto(`${baseUrl}/admin/html/order-details.html?id=${orderId}`);
    await detailsPage.waitForSelector("#deliveryInfo");
    const deliveryText = await detailsPage.locator("#deliveryInfo").innerText();
    assert.match(deliveryText, /زبون الموقع/);
    assert.match(deliveryText, /عمّان/);
    assert.match(deliveryText, /شارع الجامعة 12/);
    // Whatever the fee actually computed to (from whatever settings are live), not a hard-coded "3".
    assert.equal(await detailsPage.inputValue("#deliveryFeeInput"), String(placed.delivery_fee));

    await detailsPage.selectOption("#bottle-0", { index: 1 }); // the seeded "زجاجة 30 مل" — only match for this size
    const confirmed = detailsPage.waitForResponse(
      (r) => r.url().endsWith(`/orders/${orderId}/confirm`) && r.request().method() === "POST"
    );
    await detailsPage.click("#confirmBtn");
    assert.equal((await confirmed).status(), 200);
    await detailsPage.locator("text=تم الخصم").waitFor();
    check(detailsPage);

    const stored = await detailsPage.evaluate(async (id) => {
      const res = await fetch(`/api/orders/${id}`);
      return (await res.json()).data;
    }, orderId);
    assert.equal(stored.stock_deducted, true);
    assert.ok(stored.customer_id, "confirming an online order should link/create a customer");

    const afterConfirm = await unconfirmedCount(detailsPage);
    assert.equal(afterConfirm, before, "confirming should bring the unconfirmed count back down by one");
  });

  await scenario("XSS inert", async () => {
    // Real hostile payloads, inserted straight into the throwaway e2e DB — bypassing
    // backend/store/validate.js's cleanText() (which strips < and > at the public API) entirely.
    // That's deliberate: the admin's own esc()/DOM-building must be the thing that makes these
    // safe, not upstream validation the admin can't rely on for every past or future record.
    const PAYLOAD_A = `"><img src=x onerror=window.__xss=1>`;
    const PAYLOAD_B = `<svg onload=window.__xss=2>`;
    const PAYLOAD_C = `a & b 'q' <b>x</b>`;
    const PAYLOAD_D = `" onmouseover=window.__xss=5 x="`;

    let bottle, hostileProduct, order, order2, interest, customer;
    try {
      bottle = await Bottle.create({ name: PAYLOAD_C, capacity: 55, cost: 0.2, quantity: 20 });
      hostileProduct = await Product.create({
        p_name: "عطر اختبار XSS", p_image: "https://example.com/xss.jpg", p_category: "Men",
        oil_id: "OIL1", oil_percentage: 20, alcohol_percentage: 80, size_list: [{ size: "55", price: 15 }],
      });

      order = await Order.create({
        products: [{
          product_id: hostileProduct._id, p_name: PAYLOAD_B, product_size: "55", quantity: 1,
          selling_price: 15, total_revenue: 15, oil_id: "OIL1", oil_ml: 11, alcohol_ml: 44,
        }],
        total_items: 1, total_revenue: 15, total_cost: 0, total_profit: 0,
        payment_method: "Cash", delivery_fee: 0, final_total: 15,
        order_notes: PAYLOAD_D,
        status: "pending", created_by: "online", source: "online", stock_deducted: false,
        public_ref: crypto.randomUUID(), client_key: crypto.randomUUID(),
        delivery: { name: PAYLOAD_A, phone: "0781234567", city: "إربد", address: PAYLOAD_B, notes: PAYLOAD_C },
      });

      interest = await Interest.create({
        product_id: hostileProduct._id, product_name: PAYLOAD_B, size: "55",
        name: PAYLOAD_D, phone: "0782223334", note: PAYLOAD_C, status: "new",
      });

      // Reports' customers tab reads from Customer + a completed, linked order — not from Interest
      // or the delivery snapshot, so it needs its own hostile record.
      customer = await Customer.create({ name: PAYLOAD_A, phone: "0793334445", type: "individual" });
      order2 = await Order.create({
        products: [{
          product_id: hostileProduct._id, p_name: "عطر عادي", product_size: "55", quantity: 1,
          selling_price: 15, total_revenue: 15, oil_id: "OIL1", oil_ml: 11, alcohol_ml: 44,
        }],
        total_items: 1, total_revenue: 15, total_cost: 0, total_profit: 0,
        payment_method: "Cash", delivery_fee: 0, final_total: 15,
        status: "completed", created_by: "pos", source: "pos", stock_deducted: true, customer_id: customer._id,
      });

      const ordersPage = await openPage();
      await ordersPage.goto(`${baseUrl}/admin/html/orders.html`);
      await ordersPage.waitForLoadState("networkidle");
      await assertPageIsXssSafe(ordersPage, [PAYLOAD_A]);
      check(ordersPage);

      const detailsPage = await openPage();
      await detailsPage.goto(`${baseUrl}/admin/html/order-details.html?id=${order._id}`);
      await detailsPage.waitForSelector("#deliveryInfo");
      await assertPageIsXssSafe(detailsPage, [PAYLOAD_A, PAYLOAD_B, PAYLOAD_C, PAYLOAD_D]);
      // The bottle <option> text (M1's fix) isn't part of the flowed body text everywhere, so it
      // gets its own direct check, before confirming replaces the <select> with plain numbers.
      const bottleOptionText = await detailsPage.locator("#bottle-0 option").last().textContent();
      assert.ok(bottleOptionText.includes(PAYLOAD_C), "bottle name should render as literal text, not be stripped");

      await detailsPage.selectOption("#bottle-0", { index: 1 }); // only the hostile bottle matches this capacity
      const confirmed = detailsPage.waitForResponse(
        (r) => r.url().endsWith(`/orders/${order._id}/confirm`) && r.request().method() === "POST"
      );
      await detailsPage.click("#confirmBtn");
      assert.equal((await confirmed).status(), 200);
      await detailsPage.locator("text=تم الخصم").waitFor();
      await assertPageIsXssSafe(detailsPage, [PAYLOAD_A, PAYLOAD_B, PAYLOAD_C, PAYLOAD_D]);
      check(detailsPage);

      const interestsPage = await openPage();
      await interestsPage.goto(`${baseUrl}/admin/html/interests.html`);
      await interestsPage.waitForLoadState("networkidle");
      await assertPageIsXssSafe(interestsPage, [PAYLOAD_D, PAYLOAD_C, PAYLOAD_B]);
      check(interestsPage);

      const reportsPage = await openPage();
      await reportsPage.goto(`${baseUrl}/admin/reports?tab=customers`);
      await reportsPage.waitForFunction((t) => document.body.innerText.includes(t), PAYLOAD_A, { timeout: 10000 });
      await assertPageIsXssSafe(reportsPage, [PAYLOAD_A]);
      check(reportsPage);
    } finally {
      await Order.deleteMany({ _id: { $in: [order, order2].filter(Boolean).map((d) => d._id) } });
      if (interest) await Interest.deleteOne({ _id: interest._id });
      if (customer) await Customer.deleteOne({ _id: customer._id });
      await Customer.deleteMany({ phone: "0781234567" }); // linked by the online-order confirm above
      if (bottle) await Bottle.deleteOne({ _id: bottle._id });
      if (hostileProduct) await Product.deleteOne({ _id: hostileProduct._id });
    }
  });
}
