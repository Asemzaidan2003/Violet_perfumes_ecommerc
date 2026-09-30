// New React admin dashboard/reports. registerAdminInsightsScenarios({ scenario, openPage, check, baseUrl, admin })
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import mongoose from "mongoose";
import Bottle from "../../backend/models/bottle.model.js";
import Category from "../../backend/models/category.model.js";
import Customer from "../../backend/models/customer.model.js";
import Oil from "../../backend/models/oil.model.js";
import Order from "../../backend/models/order.model.js";
import Product from "../../backend/models/product.model.js";
import { invalidateCatalog } from "../../backend/store/catalog.js";
import { invalidateCategories } from "../../backend/services/categories.service.js";
import { assertPageIsXssSafe, noSideScroll, openAdmin } from "./admin-helpers.mjs";
import { toCsv } from "../../admin/src/lib/csv.js";

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
      req = page.waitForRequest((r) => r.url().includes("/api/reports/products"));
      await tab(page, "products").click();
      await req;
      await page.getByText("التقارير حسب المنتج قبل خصم الأكواد").waitFor();
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

  // ---- Reports (Products tab): two products, different revenue/quantity ranking, hostile name+category.
  const PROD_RANGE = { from: "2019-05-01", to: "2019-05-31" };
  const PROD_NAME = `"><img src=x onerror=window.__xss=10>`;
  const PROD_CAT = `<svg onload=window.__xss=11>`; // rendered via a real category's Arabic label
  async function seedProducts() {
    // A non-empty categories collection disables the vocab fallback, so the plain category is created too.
    const [category, plain] = await Category.create([{ key: "xsscat", slug: "xsscat", name_ar: PROD_CAT }, { key: "xssplain", slug: "xssplain", name_ar: "رجالي" }]);
    invalidateCategories();
    const productA = await Product.create({ p_name: "منتج مخفي", p_image: ".", p_category: category.key, oil_id: "OIL1", oil_percentage: 20, alcohol_percentage: 80, size_list: [{ size: "30", price: 20 }] });
    const productB = await Product.create({ p_name: "منتج عادي", p_image: ".", p_category: plain.key, oil_id: "OIL1", oil_percentage: 20, alcohol_percentage: 80, size_list: [{ size: "30", price: 5 }] });
    invalidateCatalog();
    const base = { total_items: 1, payment_method: "Cash", delivery_fee: 0, created_by: "admin", status: "completed", source: "pos", stock_deducted: true, createdAt: new Date("2019-05-10T12:00:00Z") };
    const lineA = { product_id: productA._id, p_name: PROD_NAME, product_size: "30", quantity: 5, oil_id: "OIL1", oil_ml: 6, alcohol_ml: 24, selling_price: 20, total_revenue: 100, total_cost: 40, total_profit: 60 };
    const lineB = { product_id: productB._id, p_name: "منتج عادي", product_size: "30", quantity: 10, oil_id: "OIL1", oil_ml: 6, alcohol_ml: 24, selling_price: 5, total_revenue: 50, total_cost: 25, total_profit: 25 };
    const orderA = await Order.create({ ...base, products: [lineA], total_revenue: 100, total_cost: 40, total_profit: 60, final_total: 100 });
    const orderB = await Order.create({ ...base, products: [lineB], total_revenue: 50, total_cost: 25, total_profit: 25, final_total: 50 });
    return { productA, productB, category, plain, orders: [orderA._id, orderB._id] };
  }
  const cleanupProducts = async (s) => {
    await Order.deleteMany({ _id: { $in: s.orders } });
    await Product.deleteMany({ _id: { $in: [s.productA._id, s.productB._id] } });
    await Category.deleteMany({ _id: { $in: [s.category._id, s.plain._id] } });
    invalidateCategories();
    invalidateCatalog();
  };
  const productsCsvRows = (top) => top.map((p) => [p.name, p.category ?? "-", p.quantity, p.revenue, p.cost, p.profit, p.profit_margin]);
  const productsResp = (page, needle) => page.waitForResponse((r) => r.url().includes("/api/reports/products") && r.url().includes(needle));

  await scenario("Reports (new admin): Products tab table, sort reorders, CSV, XSS-safe", async () => {
    const s = await seedProducts();
    try {
      const page = await openPage();
      await page.setViewportSize({ width: 1440, height: 900 });
      await openAdmin(page, baseUrl, admin, "/reports?tab=products");
      await page.getByText("التقارير حسب المنتج قبل خصم الأكواد").waitFor();
      assert.equal(await page.getByLabel("الترتيب حسب").inputValue(), "revenue");
      assert.equal(await page.getByLabel("عدد المنتجات").locator("option").count(), 3);
      assert.equal(await page.getByLabel("عدد المنتجات").inputValue(), "10");

      await page.getByLabel("من تاريخ").fill(PROD_RANGE.from);
      await page.getByLabel("إلى تاريخ").fill(PROD_RANGE.to);
      const respP = productsResp(page, `from=${PROD_RANGE.from}`);
      await page.getByRole("button", { name: "تطبيق", exact: true }).click();
      const applied = await respP;
      const u = new URL(applied.url());
      assert.deepEqual([u.searchParams.get("sortBy"), u.searchParams.get("limit")], ["revenue", "10"]);
      const api = await apiAt(page, applied.url());
      assert.equal(api.top_products.length, 2);
      assert.equal(api.top_products[0].name, PROD_NAME, "sorted by revenue desc: the 100 JOD line first");
      assert.equal(api.top_products[0].category, PROD_CAT, "category resolves to the (hostile) Arabic label");
      assert.equal(api.top_products[1].category, "رجالي", "Men -> its Arabic label");

      const rowsBefore = await page.locator("tbody tr").allInnerTexts();
      assert.ok(rowsBefore[0].includes(PROD_NAME) && rowsBefore[1].includes("منتج عادي"), "revenue order");
      assert.match(rowsBefore[0], /5/);
      assert.match(rowsBefore[0], /100\.00 JOD/);
      assert.match(rowsBefore[0], /40\.00 JOD/);
      assert.match(rowsBefore[0], /60\.00 JOD/);
      assert.match(rowsBefore[0], /60\.0%/);
      assert.match(rowsBefore[1], /رجالي/);

      // Sort by quantity: the 10-unit line (lower revenue) now comes first.
      const qtyResp = productsResp(page, "sortBy=quantity");
      await page.getByLabel("الترتيب حسب").selectOption("quantity");
      await qtyResp;
      const rowsAfter = await page.locator("tbody tr").allInnerTexts();
      assert.ok(rowsAfter[0].includes("منتج عادي") && rowsAfter[1].includes(PROD_NAME), "quantity sort reorders the table");

      // CSV matches the shared toCsv() escaping exactly, including the hostile name.
      const [dl] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "تصدير CSV" }).click()]);
      assert.equal(dl.suggestedFilename(), "products-report.csv");
      const csv = await fs.readFile(await dl.path(), "utf8");
      const expected = toCsv(["Product", "Category", "Quantity", "Revenue", "Cost", "Profit", "Margin %"], productsCsvRows(api.top_products.slice().sort((a, b) => b.quantity - a.quantity)));
      assert.equal(csv, expected);

      await assertPageIsXssSafe(page, [PROD_NAME, PROD_CAT]);
      assert.equal(await noSideScroll(page), true);
      check(page);
    } finally { await cleanupProducts(s); }
  });

  // ---- Reports (Customers tab): a hostile top spender and a deleted customer (row shows "-").
  const CUST_RANGE = { from: "2019-06-01", to: "2019-06-30" };
  const CUST_NAME = `"><img src=x onerror=window.__xss=12>`;
  async function seedCustomers() {
    const hostileCustomer = await Customer.create({ name: CUST_NAME, phone: "0791112223", type: "individual" });
    const normalCustomer = await Customer.create({ name: "زبون عادي", phone: "0798887776", type: "store" });
    const deletedCustomerId = new mongoose.Types.ObjectId(); // simulates a top_customers row whose Customer doc no longer exists
    const base = { total_items: 1, payment_method: "Cash", delivery_fee: 0, created_by: "admin", status: "completed", source: "pos", stock_deducted: true };
    const line = (rev) => ({ product_id: new mongoose.Types.ObjectId(), p_name: "عطر", product_size: "30", quantity: 1, selling_price: rev, total_revenue: rev, total_cost: 0, total_profit: rev, oil_id: "OIL1", oil_ml: 6, alcohol_ml: 24 });
    const orderHostile = await Order.create({ ...base, products: [line(200)], total_revenue: 200, total_cost: 0, total_profit: 200, final_total: 200, customer_id: hostileCustomer._id, createdAt: new Date("2019-06-05T10:00:00Z") });
    const orderNormal = await Order.create({ ...base, products: [line(50)], total_revenue: 50, total_cost: 0, total_profit: 50, final_total: 50, customer_id: normalCustomer._id, createdAt: new Date("2019-06-10T10:00:00Z") });
    const orderDeleted = await Order.create({ ...base, products: [line(30)], total_revenue: 30, total_cost: 0, total_profit: 30, final_total: 30, customer_id: deletedCustomerId, createdAt: new Date("2019-06-15T10:00:00Z") });
    return { hostileCustomer, normalCustomer, orders: [orderHostile._id, orderNormal._id, orderDeleted._id] };
  }
  const cleanupCustomers = async (s) => {
    await Order.deleteMany({ _id: { $in: s.orders } });
    await Customer.deleteMany({ _id: { $in: [s.hostileCustomer._id, s.normalCustomer._id] } });
  };
  const customersCsvRows = (top) => top.map((c) => [c.name ?? "-", c.phone ?? "-", c.type ?? "-", c.orders_count, c.total_spent, c.avg_order_value, c.last_order_at]);
  const customersResp = (page, needle) => page.waitForResponse((r) => r.url().includes("/api/reports/customers") && r.url().includes(needle));

  await scenario("Reports (new admin): Customers tab stats, table, CSV, deleted customer, XSS-safe", async () => {
    const s = await seedCustomers();
    try {
      const page = await openPage();
      await page.setViewportSize({ width: 1440, height: 900 });
      await openAdmin(page, baseUrl, admin, "/reports");
      await page.getByRole("heading", { name: "التقارير" }).waitFor();
      await page.getByLabel("من تاريخ").fill(CUST_RANGE.from);
      await page.getByLabel("إلى تاريخ").fill(CUST_RANGE.to);
      await page.getByRole("button", { name: "تطبيق", exact: true }).click();
      const respP = customersResp(page, `from=${CUST_RANGE.from}`);
      await tab(page, "customers").click();
      const applied = await respP;
      assert.equal(new URL(applied.url()).searchParams.get("limit"), "15");
      const api = await apiAt(page, applied.url());
      assert.equal(api.top_customers.length, 3);
      assert.equal(api.top_customers[0].name, CUST_NAME, "the 200 JOD customer is the top spender");

      const stat = (label) => card(page, label).innerText();
      assert.match(await stat("إجمالي عدد الزبائن"), new RegExp(`\\b${api.total_customers}\\b`));
      assert.match(await stat("طلبات بدون زبون مسجل"), new RegExp(`\\b${api.walk_in_orders_in_range}\\b`));
      const topStat = await stat("أعلى زبون إنفاقًا");
      assert.match(topStat, new RegExp(esc(money(200))));
      assert.ok(topStat.includes(CUST_NAME), "top-spender sub-label shows the hostile name literally");

      const rows = await page.locator("tbody tr").allInnerTexts();
      assert.equal(rows.length, 3);
      assert.ok(rows[0].includes(CUST_NAME) && /فرد/.test(rows[0]) && /0791112223/.test(rows[0]) && /200\.00 JOD/.test(rows[0]));
      assert.ok(rows[1].includes("زبون عادي") && /محل/.test(rows[1]) && /50\.00 JOD/.test(rows[1]));
      // The deleted customer: no name/phone/type from the $lookup, shown as "-", but its order stats remain.
      assert.ok(/30\.00 JOD/.test(rows[2]) && !rows[2].includes(CUST_NAME) && !rows[2].includes("زبون عادي"));
      const deletedCells = await page.locator("tbody tr", { hasText: "30.00 JOD" }).locator("td").allInnerTexts();
      assert.deepEqual(deletedCells.slice(0, 3), ["-", "-", "-"], "deleted customer: name, phone, type all show -");

      const [dl] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "تصدير CSV" }).click()]);
      assert.equal(dl.suggestedFilename(), "customers-report.csv");
      const csv = await fs.readFile(await dl.path(), "utf8");
      assert.equal(csv, toCsv(["Name", "Phone", "Type", "Orders", "Total Spent", "Avg Order", "Last Order"], customersCsvRows(api.top_customers)));

      await assertPageIsXssSafe(page, [CUST_NAME]);
      assert.equal(await noSideScroll(page), true);
      check(page);
    } finally { await cleanupCustomers(s); }
  });

  await scenario("Reports (new admin): Products and Customers tabs phone layout", async () => {
    const p = await seedProducts();
    const c = await seedCustomers();
    try {
      const page = await openPage({ mobile: true });
      await openAdmin(page, baseUrl, admin, "/reports?tab=products");
      await page.getByLabel("من تاريخ").fill(PROD_RANGE.from);
      await page.getByLabel("إلى تاريخ").fill(PROD_RANGE.to);
      await page.getByRole("button", { name: "تطبيق", exact: true }).click();
      await page.getByText("منتج عادي").first().waitFor();
      assert.equal(await page.locator("table").count(), 0, "cards, not a table, on a phone (products)");
      assert.equal(await noSideScroll(page), true, "no sideways scroll (products)");
      assert.deepEqual(await small(page), [], "every control is at least 44px tall (products)");

      await page.getByLabel("من تاريخ").fill(CUST_RANGE.from);
      await page.getByLabel("إلى تاريخ").fill(CUST_RANGE.to);
      await page.getByRole("button", { name: "تطبيق", exact: true }).click();
      await tab(page, "customers").click();
      await page.getByText("زبون عادي").first().waitFor();
      assert.equal(await page.locator("table").count(), 0, "cards, not a table, on a phone (customers)");
      assert.equal(await noSideScroll(page), true, "no sideways scroll (customers)");
      assert.deepEqual(await small(page), [], "every control is at least 44px tall (customers)");
      check(page);
    } finally {
      await cleanupProducts(p);
      await cleanupCustomers(c);
    }
  });
}
