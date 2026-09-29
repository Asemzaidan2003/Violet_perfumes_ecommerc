// New React admin dashboard/reports. registerAdminInsightsScenarios({ scenario, openPage, check, baseUrl, admin })
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import mongoose from "mongoose";
import Bottle from "../../backend/models/bottle.model.js";
import Oil from "../../backend/models/oil.model.js";
import Order from "../../backend/models/order.model.js";
import Product from "../../backend/models/product.model.js";
import { invalidateCatalog } from "../../backend/store/catalog.js";
import { assertPageIsXssSafe, noSideScroll, openAdmin } from "./admin-helpers.mjs";

const money = (n) => `${(Number(n) || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} JOD`;
const esc = (s) => s.replace(/[.+*?^${}()|[\]\\]/g, "\\$&");
const small = (page) => page.evaluate(() => [...document.querySelectorAll("main a, main button, main select, main input")]
  .map((el) => [el, el.getBoundingClientRect()]).filter(([, r]) => r.width > 0 && r.height > 0 && r.height < 44)
  .map(([el]) => `${el.tagName} ${el.getAttribute("aria-label") || el.textContent.trim().slice(0, 20)}`));

export async function registerAdminInsightsScenarios({ scenario, openPage, check, baseUrl, admin }) {
  const A = `"><img src=x onerror=window.__xss=1>`; // product (top products list)
  const B = `<svg onload=window.__xss=2>`; // oil
  const C = `a & b 'q' <b>x</b>`; // bottle
  const stamp = crypto.randomUUID().slice(0, 8);

  async function seed() {
    const product = await Product.create({
      p_name: A, p_image: ".", p_category: "Men", oil_id: "OIL1", oil_percentage: 20, alcohol_percentage: 80,
      size_list: [{ size: "30", price: 123.45 }],
    });
    invalidateCatalog();
    const oil = await Oil.create({ id: `DSH-${stamp}`, oil_name: B, oil_cost: 1, oil_quantity: 1 });
    const bottle = await Bottle.create({ name: C, capacity: 30, cost: 0.2, quantity: 1 });
    const base = { total_items: 1, payment_method: "Cash", delivery_fee: 0, created_by: "admin" };
    const line = { product_id: product._id, p_name: A, product_size: "30", quantity: 1, oil_id: "OIL1", oil_ml: 6, alcohol_ml: 24 };
    const done = await Order.create({
      ...base, products: [{ ...line, selling_price: 123.45, total_revenue: 123.45 }], total_revenue: 123.45, total_cost: 10, total_profit: 50.5,
      final_total: 123.45, status: "completed", source: "pos", stock_deducted: true,
    });
    const unconfirmed = await Order.create({
      ...base, products: [{ ...line, selling_price: 22, total_revenue: 22 }], total_revenue: 22, total_cost: 0, total_profit: 0,
      final_total: 22, status: "pending", source: "online", created_by: "online", stock_deducted: false,
      public_ref: crypto.randomUUID(), client_key: crypto.randomUUID(), delivery: { name: "زبون لوحة", phone: "0781234567", city: "إربد", address: "x", notes: "" },
    });
    return { product, oil, bottle, orders: [done._id, unconfirmed._id] };
  }
  const cleanup = async (s) => {
    await Order.deleteMany({ _id: { $in: s.orders } });
    await Oil.deleteOne({ _id: s.oil._id });
    await Bottle.deleteOne({ _id: s.bottle._id });
    await Product.deleteOne({ _id: s.product._id });
    invalidateCatalog();
  };
  const apiData = (page) => page.evaluate(async () => (await (await fetch("/api/reports/dashboard")).json()).data);
  const card = (page, label) => page.locator("main div.rounded-xl", { has: page.getByText(label, { exact: true }) }).first();

  await scenario("Dashboard (new admin): KPIs, charts, lists match the API", async () => {
    let s;
    try {
      const page = await openPage();
      await page.setViewportSize({ width: 1440, height: 900 });
      await openAdmin(page, baseUrl, admin, "/dashboard");
      await page.getByText("مبيعات اليوم", { exact: true }).waitFor();
      const before = await apiData(page);
      s = await seed();
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
      assert.equal(await btn.isDisabled(), true, "button disabled while the request is in flight");
      await refreshed;
      await page.waitForFunction((t) => { const el = [...document.querySelectorAll("span")].find((e) => e.textContent.startsWith("آخر تحديث")); return el && el.textContent !== t; }, stamp1);
      assert.equal(await btn.isDisabled(), false);
      await page.unroute("**/api/reports/dashboard");
      assert.equal(await noSideScroll(page), true);
      check(page);
    } finally { if (s) await cleanup(s); }
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
    const s = await seed();
    try {
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

  // ---- Reports (Sales tab): three completed orders in March 2020, two in ISO week 10, one in week 11.
  const RANGE = { from: "2020-03-01", to: "2020-03-31" };
  async function seedSales() {
    const mk = (day, rev, cost, profit) => Order.create({
      products: [{ product_id: new mongoose.Types.ObjectId(), p_name: "rep", product_size: "30", quantity: 1, selling_price: rev, total_revenue: rev, oil_id: "OIL1", oil_ml: 6, alcohol_ml: 24 }],
      total_items: 1, payment_method: "Cash", delivery_fee: 0, created_by: "admin", total_revenue: rev, total_cost: cost, total_profit: profit,
      final_total: rev, status: "completed", source: "pos", stock_deducted: true, createdAt: new Date(`${day}T12:00:00Z`),
    });
    return (await Promise.all([mk("2020-03-02", 100, 40, 60), mk("2020-03-04", 50, 20, 30), mk("2020-03-10", 10, 15, -5)])).map((o) => o._id);
  }
  // Re-fetches the exact URL the page requested, through the page's own session.
  const apiAt = (page, url) => page.evaluate(async (u) => (await (await fetch(u)).json()).data, url);
  const salesResp = (page, needle) => page.waitForResponse((r) => r.url().includes("/api/reports/sales") && r.url().includes(needle));
  const params = (resp) => new URL(resp.url()).searchParams;
  const tab = (page, name) => page.locator(`[role="tab"][data-tab="${name}"]`);
  const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const daysAgo = (n) => { const d = new Date(); d.setDate(d.getDate() - n); return ymd(d); };
  const applyRange = async (page, from, to) => {
    await page.getByLabel("من تاريخ").fill(from);
    await page.getByLabel("إلى تاريخ").fill(to);
    const resp = salesResp(page, `from=${from}`);
    await page.getByRole("button", { name: "تطبيق", exact: true }).click();
    return resp;
  };

  await scenario("Reports (new admin): Sales tab stats, presets, group-by, CSV, empty state, tab deep link", async () => {
    const ids = await seedSales();
    try {
      const page = await openPage();
      await page.setViewportSize({ width: 1440, height: 900 });
      await openAdmin(page, baseUrl, admin, "/reports");
      await page.getByRole("heading", { name: "التقارير" }).waitFor();
      assert.equal(await tab(page, "sales").getAttribute("aria-selected"), "true", "sales is the default tab");
      for (const t of ["sales", "products", "inventory", "customers"]) assert.equal(await tab(page, t).count(), 1, t);
      await page.getByText(/الطلبات الملغاة لا تظهر في التقارير/).waitFor();
      assert.equal(await page.getByLabel("حالة الطلبات").locator("option").count(), 4);
      assert.equal(await page.getByLabel("حالة الطلبات").inputValue(), "completed");
      assert.equal(await page.getByLabel("من تاريخ").inputValue(), daysAgo(29), "default preset is 30d");
      assert.equal(await page.getByRole("button", { name: "آخر 30 يوم" }).getAttribute("aria-pressed"), "true");

      // Presets apply immediately and change the query.
      let req = page.waitForRequest((r) => r.url().includes("/api/reports/sales") && r.url().includes(`from=${daysAgo(89)}`));
      await page.getByRole("button", { name: "آخر 90 يوم" }).click();
      const u = new URL((await req).url());
      assert.equal(u.searchParams.get("to"), daysAgo(0));
      assert.equal(u.searchParams.get("status"), "completed");
      assert.equal(await page.getByRole("button", { name: "آخر 90 يوم" }).getAttribute("aria-pressed"), "true");
      req = page.waitForRequest((r) => r.url().includes("/api/reports/sales") && r.url().includes(`from=${daysAgo(0)}&to=${daysAgo(0)}`));
      await page.getByRole("button", { name: "اليوم", exact: true }).click();
      await req;

      // A preset applies the current (unapplied) status select value too.
      await page.getByLabel("حالة الطلبات").selectOption("all");
      req = page.waitForRequest((r) => r.url().includes("/api/reports/sales") && r.url().includes(`from=${daysAgo(new Date().getDate() - 1)}`));
      await page.getByRole("button", { name: "هذا الشهر" }).click();
      assert.equal(new URL((await req).url()).searchParams.get("status"), "all");
      assert.equal(await page.getByLabel("حالة الطلبات").inputValue(), "all");
      await page.getByLabel("حالة الطلبات").selectOption("completed");

      // Exact range: totals equal the seeded orders and the response for the URL the page really requested.
      const applied = await applyRange(page, RANGE.from, RANGE.to);
      const p1 = params(applied);
      assert.deepEqual([p1.get("from"), p1.get("to"), p1.get("status"), p1.get("groupBy")], [RANGE.from, RANGE.to, "completed", "day"], "page sent from/to/status/groupBy");
      assert.equal(await page.getByRole("button", { name: "آخر 90 يوم" }).getAttribute("aria-pressed"), "false", "applying dates clears the preset highlight");
      const api = await apiAt(page, applied.url());
      assert.equal(api.totals.revenue, 160);
      await page.getByText(money(160), { exact: false }).first().waitFor();
      const stat = (label) => card(page, label).innerText();
      assert.match(await stat("إجمالي المبيعات"), new RegExp(esc(money(api.totals.revenue))));
      assert.match(await stat("إجمالي التكلفة"), new RegExp(esc(money(75))));
      assert.match(await stat("إجمالي الربح"), new RegExp(esc(money(85))));
      assert.match(await stat("هامش الربح"), /53\.1%/);
      assert.match(await stat("عدد الطلبات"), /\b3\b/);
      assert.match(await stat("متوسط قيمة الطلب"), new RegExp(esc(money(api.totals.avg_order_value))));
      assert.equal(await page.locator("main svg.recharts-surface").first().isVisible(), true, "chart renders");
      assert.equal(await page.locator("tbody tr").count(), 3, "one row per day");
      // Losses stay visible: the zero baseline sits above the plot bottom.
      const zeroY = await page.locator("main .recharts-reference-line line").first().evaluate((l) => Number(l.getAttribute("y1")));
      const axisY = await page.locator("main .recharts-cartesian-grid-horizontal line").evaluateAll((ls) => Math.max(...ls.map((l) => Number(l.getAttribute("y1")))));
      assert.ok(zeroY < axisY - 1, `zero line (${zeroY}) must be above the plot bottom (${axisY}) so -5 profit shows`);

      // Group by week changes the table and the request.
      const wk = salesResp(page, "groupBy=week");
      await page.getByLabel("تجميع حسب").selectOption("week");
      const p2 = params(await wk);
      assert.deepEqual([p2.get("from"), p2.get("to"), p2.get("status")], [RANGE.from, RANGE.to, "completed"], "group-by keeps the filters");
      await page.locator("tbody").getByText("2020-W11", { exact: true }).waitFor();
      assert.equal(await page.locator("tbody tr").count(), 2, "two ISO weeks");
      assert.match(await page.locator("tr", { hasText: "2020-W10" }).innerText(), /150\.00 JOD/);

      // CSV: BOM, exact header, guarded negative profit, filename.
      const [dl] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "تصدير CSV" }).click()]);
      assert.equal(dl.suggestedFilename(), "sales-report.csv");
      const csv = await fs.readFile(await dl.path(), "utf8");
      assert.ok(csv.startsWith("﻿Period,Revenue,Cost,Profit,Orders,Avg Order Value\n"), "BOM + legacy header");
      assert.ok(csv.includes("\n2020-W10,150,60,90,2,75\n2020-W11,10,15,'-5,1,10"), `rows: ${JSON.stringify(csv)}`);

      // Empty range: empty state.
      await applyRange(page, "2001-01-01", "2001-01-02");
      await page.getByText("لا توجد بيانات لهذه الفترة").waitFor();
      assert.equal(await page.locator("tbody tr").count(), 0);

      // Switching tabs refetches; ?tab= deep link opens a tab and hides the date bar on inventory.
      await tab(page, "products").click();
      await page.getByText("قريبًا").waitFor();
      assert.match(page.url(), /tab=products/);
      req = page.waitForRequest((r) => r.url().includes("/api/reports/sales"));
      await tab(page, "sales").click();
      await req;
      await page.goto(`${baseUrl}/admin/reports?tab=inventory`);
      await tab(page, "inventory").waitFor();
      assert.equal(await tab(page, "inventory").getAttribute("aria-selected"), "true");
      assert.equal(await page.getByRole("button", { name: "تطبيق", exact: true }).count(), 0, "filters hidden on inventory");
      check(page);
    } finally { await Order.deleteMany({ _id: { $in: ids } }); }
  });

  await scenario("Reports (new admin): a failed Sales load shows an error with a working retry", async () => {
    const page = await openPage();
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.route("**/api/reports/sales*", (rt) => rt.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ success: false, message: "boom" }) }));
    await openAdmin(page, baseUrl, admin, "/reports");
    const alert = page.getByRole("alert");
    await alert.waitFor();
    assert.equal(await page.getByRole("alert").count(), 1);
    await page.unroute("**/api/reports/sales*");
    await alert.getByRole("button", { name: "إعادة المحاولة" }).click();
    await page.getByText("إجمالي المبيعات", { exact: true }).waitFor();
    assert.equal(await page.getByRole("alert").count(), 0);
    assert.deepEqual(page.errors.filter((e) => !/status of 500/.test(e)), []);
  });

  await scenario("Reports (new admin): phone layout", async () => {
    const ids = await seedSales();
    try {
      const page = await openPage({ mobile: true });
      await openAdmin(page, baseUrl, admin, "/reports");
      await page.getByText("إجمالي المبيعات", { exact: true }).waitFor();
      await applyRange(page, RANGE.from, RANGE.to);
      await page.getByText("2020-03-10", { exact: true }).first().waitFor();
      assert.equal(await page.locator("table").count(), 0, "cards, not a table, on a phone");
      assert.equal(await noSideScroll(page), true, "no sideways scroll");
      assert.deepEqual(await small(page), [], "every control is at least 44px tall");
      // Preset row and tab list scroll sideways instead of overflowing the page; the last item is reachable and clickable.
      const chips = page.getByRole("group", { name: "فترات جاهزة" });
      assert.ok(await chips.evaluate((e) => e.scrollWidth > e.clientWidth), "preset row overflows and scrolls");
      await page.getByRole("button", { name: "اليوم", exact: true }).click();
      const last = page.getByRole("button", { name: "آخر 90 يوم" });
      await last.scrollIntoViewIfNeeded();
      await last.click();
      assert.equal(await last.getAttribute("aria-pressed"), "true");
      const tabs = page.getByRole("tablist");
      assert.ok(await tabs.evaluate((e) => e.scrollWidth >= e.clientWidth), "tab list fits or scrolls");
      const lastTab = tab(page, "customers");
      await lastTab.scrollIntoViewIfNeeded();
      await lastTab.click();
      assert.equal(await lastTab.getAttribute("aria-selected"), "true");
      assert.equal(await tabs.evaluate((e) => e.scrollWidth - e.clientWidth <= 1 || getComputedStyle(e).overflowX !== "visible"), true, "tab list scrollable when it overflows");
      check(page);
    } finally { await Order.deleteMany({ _id: { $in: ids } }); }
  });
}
