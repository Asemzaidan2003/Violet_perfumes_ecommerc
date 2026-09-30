// New React admin Reports > Inventory tab. registerAdminInventoryScenarios({ scenario, openPage, check, baseUrl, admin })
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import Alcohol from "../../backend/models/alcohol.model.js";
import Bottle from "../../backend/models/bottle.model.js";
import Oil from "../../backend/models/oil.model.js";
import { assertPageIsXssSafe, noSideScroll, openAdmin } from "./admin-helpers.mjs";
import { toCsv } from "../../admin/src/lib/csv.js";

const money = (n) => `${(Number(n) || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} JOD`;
const small = (page) => page.evaluate(() => [...document.querySelectorAll("main a, main button, main select, main input")]
  .map((el) => [el, el.getBoundingClientRect()]).filter(([, r]) => r.width > 0 && r.height > 0 && r.height < 44)
  .map(([el]) => `${el.tagName} ${el.getAttribute("aria-label") || el.textContent.trim().slice(0, 20)}`));

export async function registerAdminInventoryScenarios({ scenario, openPage, check, baseUrl, admin }) {
  const stamp = crypto.randomUUID().slice(0, 8);
  const ALC = `"><img src=x onerror=window.__xss=20> ${stamp}`;
  const ALC_TYPE = `نوع "${stamp}"`;
  const OIL_LOW = `زيت منخفض ${stamp}`;
  const OIL_NEG = `زيت مستحق <b>${stamp}</b>`;
  const OIL_BIG = `زيت وفير ${stamp}`;
  const BOTTLE_LOW = `زجاجة قليلة ${stamp}`;

  const seed = {};
  async function seedAll() {
    seed.oils = await Oil.create([
      { id: `INV-${stamp}-1`, oil_name: OIL_LOW, oil_cost: 2, oil_quantity: 5 },
      { id: `INV-${stamp}-2`, oil_name: OIL_NEG, oil_cost: 1, oil_quantity: -30 },
      { id: `INV-${stamp}-3`, oil_name: OIL_BIG, oil_cost: 0.5, oil_quantity: 500, status: "discontinued" },
    ]);
    seed.bottles = await Bottle.create([
      { name: BOTTLE_LOW, capacity: 50, cost: 0.4, quantity: 3 },
      { name: `زجاجة وفيرة ${stamp}`, capacity: 30, cost: 0.3, quantity: 200 },
    ]);
    seed.alcohol = await Alcohol.create({ name: ALC, type: ALC_TYPE, quantity: 40, cost: 1.25 });
    return seed;
  }
  // Safe to call after a partial seed: only removes what was created.
  const cleanup = async () => {
    if (seed.oils) await Oil.deleteMany({ _id: { $in: seed.oils.map((o) => o._id) } });
    if (seed.bottles) await Bottle.deleteMany({ _id: { $in: seed.bottles.map((b) => b._id) } });
    if (seed.alcohol) await Alcohol.deleteOne({ _id: seed.alcohol._id });
    delete seed.oils; delete seed.bottles; delete seed.alcohol;
  };
  const invApi = (page) => page.evaluate(async () => (await (await fetch("/api/reports/inventory")).json()).data);
  const card = (page, label) => page.locator("main div.rounded-xl", { has: page.getByText(label, { exact: true }) }).first();
  const invResp = (page, needle) => page.waitForResponse((r) => r.url().includes("/api/reports/inventory") && r.url().includes(needle));

  await scenario("Reports (new admin): Inventory tab cards, low stock, owed stock, thresholds, CSV, XSS-safe", async () => {
    try {
      await seedAll();
      const page = await openPage();
      await page.setViewportSize({ width: 1440, height: 900 });
      await openAdmin(page, baseUrl, admin, "/reports?tab=inventory");
      await page.getByRole("heading", { name: "مخزون الزيوت" }).waitFor();
      assert.equal(await page.locator('[role="tab"][data-tab="inventory"]').getAttribute("aria-selected"), "true");
      const api = await invApi(page);
      for (const [label, v] of [["رأس مال الزيوت", api.totals.oil_capital], ["رأس مال الزجاجات", api.totals.bottle_capital],
        ["رأس مال الكحول", api.totals.alcohol_capital], ["إجمالي رأس المال", api.totals.total_capital]]) {
        assert.ok((await card(page, label).innerText()).includes(money(v)), `${label} card`);
      }
      assert.equal(await page.getByLabel("حد تنبيه الزيت (ML)").inputValue(), "100");
      assert.equal(await page.getByLabel("حد تنبيه الزجاجات (قطعة)").inputValue(), "20");

      // Low-stock lists mirror the API subsets.
      const lowOils = page.getByRole("list", { name: "زيوت تحتاج إعادة تعبئة" });
      await lowOils.getByText(OIL_LOW).waitFor();
      assert.equal(await lowOils.locator("li").count(), api.low_stock_oils.length);
      const negLi = lowOils.locator("li", { hasText: OIL_NEG });
      await negLi.waitFor();
      assert.match(await negLi.innerText(), /مستحق/, "owed hint in the low-stock list");
      const lowBottles = page.getByRole("list", { name: "زجاجات تحتاج إعادة تعبئة" });
      await lowBottles.getByText(BOTTLE_LOW).waitFor();
      assert.equal(await lowBottles.locator("li").count(), api.low_stock_bottles.length);

      // Owed (negative) stock: negative number and hint; Arabic status labels; stock bars have a text alternative.
      const negRow = page.locator("#oilsTable tbody tr", { hasText: OIL_NEG });
      await negRow.waitFor();
      const negText = await negRow.innerText();
      assert.match(negText, /-30/);
      assert.match(negText, /مستحق/);
      assert.ok((await page.locator("#oilsTable tbody tr", { hasText: OIL_BIG }).innerText()).includes("متوقف"));
      assert.ok(await page.locator('#oilsTable [role="img"][aria-label]').count() >= 3);

      // Threshold change refetches with the new query; blank falls back to the defaults.
      await page.getByLabel("حد تنبيه الزيت (ML)").fill("3");
      const r1 = invResp(page, "oilThreshold=3");
      await page.getByRole("button", { name: "تحديث", exact: true }).click();
      assert.equal(new URL((await r1).url()).searchParams.get("bottleThreshold"), "20");
      await lowOils.getByText(OIL_LOW).waitFor({ state: "detached" });
      await page.getByLabel("حد تنبيه الزيت (ML)").fill("");
      const r2 = invResp(page, "oilThreshold=100");
      await page.getByRole("button", { name: "تحديث", exact: true }).click();
      await r2;
      await lowOils.getByText(OIL_LOW).waitFor();

      // CSV exports.
      const fresh = await invApi(page);
      const [d1] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "تصدير الزيوت CSV" }).click()]);
      assert.equal(d1.suggestedFilename(), "oils-inventory.csv");
      assert.equal(await fs.readFile(await d1.path(), "utf8"), toCsv(["Name", "Quantity (ML)", "Cost/ML", "Value", "Status"], fresh.oils.map((o) => [o.name, o.quantity, o.cost, o.value, o.status])));
      const [d2] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "تصدير الزجاجات CSV" }).click()]);
      assert.equal(d2.suggestedFilename(), "bottles-inventory.csv");
      assert.equal(await fs.readFile(await d2.path(), "utf8"), toCsv(["Name", "Capacity", "Quantity", "Cost", "Value"], fresh.bottles.map((b) => [b.name, b.capacity, b.quantity, b.cost, b.value])));

      await assertPageIsXssSafe(page, [ALC, OIL_NEG]);
      assert.equal(await noSideScroll(page), true);
      check(page);
    } finally { await cleanup(); }
  });

  await scenario("Reports (new admin): Inventory alcohol inline editor validates and adds stock atomically", async () => {
    try {
      await seedAll();
      const page = await openPage();
      await page.setViewportSize({ width: 1440, height: 900 });
      await openAdmin(page, baseUrl, admin, "/reports?tab=inventory");
      const row = page.locator("#alcoholTable tbody tr", { hasText: ALC_TYPE });
      await row.waitFor();
      await row.getByRole("button", { name: "تعديل" }).click();
      const id = String(seed.alcohol._id);
      assert.equal(await page.locator(`#alcohol-name-${id}`).inputValue(), ALC, "hostile name prefilled literally");
      assert.equal(await page.locator(`#alcohol-quantity-${id}`).inputValue(), "40");

      await page.locator(`#alcohol-add-${id}`).fill("0");
      await page.getByRole("button", { name: "حفظ" }).click();
      await page.getByText("يرجى تعبئة جميع الحقول بشكل صحيح").waitFor();
      assert.equal((await Alcohol.findById(id)).quantity, 40, "invalid form sends nothing");

      await page.locator(`#alcohol-add-${id}`).fill("10");
      const put = page.waitForResponse((r) => r.request().method() === "PUT" && r.url().endsWith(`/api/alcohols/${id}`));
      await page.getByRole("button", { name: "حفظ" }).click();
      const res = await put;
      assert.deepEqual(Object.keys(res.request().postDataJSON()).sort(), ["add_quantity", "cost", "name", "type"]);
      assert.equal(res.status(), 200);
      await page.locator(`#alcohol-name-${id}`).waitFor({ state: "detached" });
      const doc = await Alcohol.findById(id);
      assert.equal(doc.quantity, 50, "DB increased by exactly 10");
      assert.equal(doc.name, ALC, "name saved back unchanged");
      await page.locator("#alcoholTable tbody tr", { hasText: ALC_TYPE }).getByText("50", { exact: true }).waitFor();
      await assertPageIsXssSafe(page, [ALC]);
      check(page);
    } finally { await cleanup(); }
  });

  await scenario("Reports (new admin): Inventory tab phone layout and editor dialog", async () => {
    try {
      await seedAll();
      const page = await openPage({ mobile: true });
      await openAdmin(page, baseUrl, admin, "/reports?tab=inventory");
      await page.getByText(ALC_TYPE).first().waitFor();
      assert.equal(await page.locator("table").count(), 0, "cards, not tables, on a phone");
      assert.equal(await noSideScroll(page), true);
      assert.deepEqual(await small(page), [], "every control is at least 44px tall");
      await page.locator("li", { hasText: ALC_TYPE }).getByRole("button", { name: "تعديل" }).click();
      const dlg = page.getByRole("dialog");
      await dlg.waitFor();
      await dlg.evaluate((el) => Promise.all(el.getAnimations().map((a) => a.finished))); // measure after the zoom-in settles
      const tiny = await dlg.locator("button, input").evaluateAll((els) => els.map((e) => [e, e.getBoundingClientRect()]).filter(([, r]) => r.height < 44 || r.width < 44).map(([e]) => e.textContent.trim() || e.id));
      assert.deepEqual(tiny, [], "dialog controls are at least 44px");
      assert.equal(await dlg.getByLabel("الاسم").inputValue(), ALC);
      await dlg.getByLabel("إضافة").fill("2.5");
      await dlg.getByRole("button", { name: "حفظ" }).click();
      await dlg.waitFor({ state: "detached" });
      assert.equal((await Alcohol.findById(seed.alcohol._id)).quantity, 42.5);
      check(page);
    } finally { await cleanup(); }
  });
}
