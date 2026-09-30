// New React admin dashboard. registerAdminDashboardScenarios({ scenario, openPage, check, baseUrl, admin })
import assert from "node:assert/strict";
import crypto from "node:crypto";
import Bottle from "../../backend/models/bottle.model.js";
import Oil from "../../backend/models/oil.model.js";
import Order from "../../backend/models/order.model.js";
import Product from "../../backend/models/product.model.js";
import { invalidateCatalog } from "../../backend/store/catalog.js";
import { assertPageIsXssSafe, card, esc, money, noSideScroll, openAdmin, small } from "./admin-helpers.mjs";

export async function registerAdminDashboardScenarios({ scenario, openPage, check, baseUrl, admin }) {
  const A = `"><img src=x onerror=window.__xss=1>`; // product (top products list)
  const B = `<svg onload=window.__xss=2>`; // oil
  const C = `a & b 'q' <b>x</b>`; // bottle
  const stamp = crypto.randomUUID().slice(0, 8);

  async function seed(s) {
    const product = s.product = await Product.create({
      p_name: A, p_image: ".", p_category: "Men", oil_id: "OIL1", oil_percentage: 20, alcohol_percentage: 80,
      size_list: [{ size: "30", price: 123.45 }],
    });
    invalidateCatalog();
    const oil = s.oil = await Oil.create({ id: `DSH-${stamp}`, oil_name: B, oil_cost: 1, oil_quantity: 1 });
    const bottle = s.bottle = await Bottle.create({ name: C, capacity: 30, cost: 0.2, quantity: 1 });
    const base = { total_items: 1, payment_method: "Cash", delivery_fee: 0, created_by: "admin" };
    const line = { product_id: product._id, p_name: A, product_size: "30", quantity: 1, oil_id: "OIL1", oil_ml: 6, alcohol_ml: 24 };
    const done = await Order.create({
      ...base, products: [{ ...line, selling_price: 123.45, total_revenue: 123.45 }], total_revenue: 123.45, total_cost: 10, total_profit: 50.5,
      final_total: 123.45, status: "completed", source: "pos", stock_deducted: true,
    });
    s.orders.push(done._id);
    const unconfirmed = await Order.create({
      ...base, products: [{ ...line, selling_price: 22, total_revenue: 22 }], total_revenue: 22, total_cost: 0, total_profit: 0,
      final_total: 22, status: "pending", source: "online", created_by: "online", stock_deducted: false,
      public_ref: crypto.randomUUID(), client_key: crypto.randomUUID(), delivery: { name: "زبون لوحة", phone: "0781234567", city: "إربد", address: "x", notes: "" },
    });
    s.orders.push(unconfirmed._id);
  }
  const cleanup = async (s) => {
    await Order.deleteMany({ _id: { $in: s.orders } });
    if (s.oil) await Oil.deleteOne({ _id: s.oil._id });
    if (s.bottle) await Bottle.deleteOne({ _id: s.bottle._id });
    if (s.product) await Product.deleteOne({ _id: s.product._id });
    invalidateCatalog();
  };
  const apiData = (page) => page.evaluate(async () => (await (await fetch("/api/reports/dashboard")).json()).data);

  await scenario("Dashboard (new admin): KPIs, charts, lists match the API", async () => {
    const s = { orders: [] };
    try {
      const page = await openPage();
      await page.setViewportSize({ width: 1440, height: 900 });
      await openAdmin(page, baseUrl, admin, "/dashboard");
      await page.getByText("مبيعات اليوم", { exact: true }).waitFor();
      const before = await apiData(page);
      await seed(s);
      await page.reload();
      await page.getByRole("heading", { name: "لوحة المعلومات" }).waitFor();
      await page.getByText("آخر تحديث", { exact: false }).waitFor();
      await page.getByText("مبيعات اليوم", { exact: true }).waitFor();
      const d = await apiData(page);
      for (const [label, value] of [
        ["مبيعات اليوم", money(d.today.revenue)], ["أرباح اليوم", money(d.today.profit)],
        ["مبيعات هذا الشهر", money(d.this_month.revenue)], ["أرباح هذا الشهر", money(d.this_month.profit)],
        ["رأس المال في المخزون", money(d.inventory.total_capital)],
      ]) assert.match(await card(page, label).innerText(), new RegExp(esc(value)), label);
      // Only the completed 123.45 order counts: the unconfirmed 22 JOD online order adds nothing to today's figures.
      const r2 = (n) => Math.round(n * 100) / 100;
      assert.equal(r2(d.today.revenue - before.today.revenue), 123.45, "revenue delta is exactly the completed order");
      assert.equal(d.today.orders_count - before.today.orders_count, 1, "one completed order, not the pending one");
      assert.equal(r2(d.today.profit - before.today.profit), 50.5);
      assert.equal(d.pending_orders_count - before.pending_orders_count, 1, "the unconfirmed order counts as pending");
      assert.equal(await page.getByRole("status", { name: "جارٍ التحميل" }).count(), 0, "skeleton gone once loaded");
      assert.ok(d.pending_orders_count >= 1, "the unconfirmed order counts as pending");
      assert.match(await card(page, "طلبات قيد الانتظار").innerText(), new RegExp(`\\b${d.pending_orders_count}\\b`));
      await card(page, "طلبات قيد الانتظار").getByText(/بانتظار التأكيد/).waitFor();
      assert.ok(await card(page, "طلبات قيد الانتظار").evaluate((el) => /st-pending/.test(el.className)), "warning tone when > 0");
      assert.ok(await card(page, "تنبيهات نقص المخزون").evaluate((el) => /st-canceled/.test(el.className)), "danger tone when low stock");

      // Charts: both render real SVG with size.
      await page.locator("main svg.recharts-surface").nth(1).waitFor();
      const boxes = await page.locator("main svg.recharts-surface").evaluateAll((els) => els.map((e) => { const r = e.getBoundingClientRect(); return [r.width, r.height]; }));
      assert.ok(boxes.length >= 2 && boxes.every(([w, h]) => w > 50 && h > 50), `charts rendered: ${JSON.stringify(boxes)}`);
      assert.ok(await page.locator("main .recharts-line").count() >= 2, "revenue and profit lines");
      await page.locator("main .recharts-sector").first().waitFor();
      await page.waitForFunction(() => [...document.querySelectorAll("main .recharts-sector")].some((e) => { const r = e.getBoundingClientRect(); return r.width > 20 && r.height > 20; }), null, { timeout: 5000 }); // after the entry animation
      assert.ok(await page.locator('main [role="img"][aria-label]').count() >= 2, "charts have text alternatives");

      // Lists show hostile names literally, safely.
      await assertPageIsXssSafe(page, [A, B, C]);
      assert.equal((await page.locator("li", { hasText: A }).locator("span").first().innerText()).trim(), "1", "rank cell");
      assert.match(await page.locator("li", { hasText: A }).innerText(), /1 قطعة/);
      assert.match(await page.locator("li", { hasText: B }).innerText(), /زيت/);
      assert.match(await page.locator("li", { hasText: B }).innerText(), /1 ML/);
      assert.match(await page.locator("li", { hasText: C }).innerText(), /زجاجة/);
      const lows = await page.locator("main li", { hasText: /زيت|زجاجة/ }).allInnerTexts();
      assert.ok(lows.findIndex((t) => t.includes(B)) < lows.findIndex((t) => t.includes(C)), "oils before bottles");

      // Recent orders row.
      const row = page.locator("tr", { hasText: "123.45 JOD" });
      await row.waitFor();
      assert.match(await row.innerText(), /50\.50 JOD/);
      assert.match(await row.innerText(), /مكتمل/);
      assert.equal(await page.getByRole("link", { name: "عرض جميع الطلبات" }).getAttribute("href"), "/admin/orders");
      assert.equal(await page.getByRole("link", { name: "عرض الكل" }).getAttribute("href"), "/admin/reports?tab=inventory");

      // Refresh: a real request (delayed so the disabled state is observable) and a newer "آخر تحديث".
      await page.route("**/api/reports/dashboard", async (rt) => { await new Promise((r) => setTimeout(r, 1200)); await rt.continue(); });
      const stamp1 = await page.getByText(/آخر تحديث/).innerText();
      const btn = page.getByRole("button", { name: "تحديث", exact: true });
      const refreshed = page.waitForResponse((r) => r.url().endsWith("/api/reports/dashboard") && r.status() === 200);
      await btn.click();
      await page.waitForFunction((el) => el.disabled, await btn.elementHandle(), { timeout: 1000 }); // disabled while the (delayed) request is in flight
      await refreshed;
      await page.waitForFunction((t) => { const el = [...document.querySelectorAll("span")].find((e) => e.textContent.startsWith("آخر تحديث")); return el && el.textContent !== t; }, stamp1);
      assert.equal(await btn.isDisabled(), false);
      await page.unroute("**/api/reports/dashboard");
      assert.equal(await noSideScroll(page), true);
      check(page);
    } finally { await cleanup(s); }
  });

  await scenario("Dashboard (new admin): a failed load shows one error with a working retry", async () => {
    const page = await openPage();
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.route("**/api/reports/dashboard", async (rt) => { await new Promise((r) => setTimeout(r, 800)); await rt.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ success: false, message: "boom" }) }); });
    await openAdmin(page, baseUrl, admin, "/dashboard");
    const skeleton = page.getByRole("status", { name: "جارٍ التحميل" });
    await skeleton.waitFor(); // the locator matches the real skeleton markup while loading
    assert.equal(await skeleton.count(), 1);
    const alert = page.getByRole("alert");
    await alert.waitFor();
    assert.equal(await page.getByRole("alert").count(), 1, "one error state for the whole page");
    assert.equal(await page.getByText("مبيعات اليوم", { exact: true }).count(), 0);
    assert.equal(await skeleton.count(), 0, "no lingering loading placeholders");
    await page.unroute("**/api/reports/dashboard");
    await alert.getByRole("button", { name: "إعادة المحاولة" }).click();
    await page.getByText("مبيعات اليوم", { exact: true }).waitFor();
    assert.equal(await page.getByRole("alert").count(), 0);
    assert.equal(await skeleton.count(), 0);
    assert.deepEqual(page.errors.filter((e) => !/status of 500/.test(e)), []);
  });

  await scenario("Dashboard (new admin): phone layout", async () => {
    const s = { orders: [] };
    try {
      await seed(s);
      const page = await openPage({ mobile: true });
      await openAdmin(page, baseUrl, admin, "/dashboard");
      await page.getByText("مبيعات اليوم", { exact: true }).waitFor();
      await page.locator("main svg.recharts-surface").first().waitFor();
      await page.locator("li", { hasText: A }).first().waitFor();
      assert.equal(await page.locator("table").count(), 0, "cards, not a table, on a phone");
      assert.equal(await noSideScroll(page), true, "no sideways scroll");
      assert.deepEqual(await small(page), [], "every control is at least 44px tall");
      check(page);
    } finally { await cleanup(s); }
  });
}
