// New React admin stock catalogues: oils, bottles, alcohol. registerAdminStockScenarios({ scenario, openPage, check, baseUrl, admin })
import assert from "node:assert/strict";
import crypto from "node:crypto";
import Alcohol from "../../backend/models/alcohol.model.js";
import Bottle from "../../backend/models/bottle.model.js";
import Oil from "../../backend/models/oil.model.js";
import { invalidateCatalog } from "../../backend/store/catalog.js";
import { assertPageIsXssSafe, noSideScroll, openAdmin, small } from "./admin-helpers.mjs";

const NOISE = /status of (400|404|409)|ERR_FAILED/;
const get = (page, url) => page.evaluate(async (u) => { const r = await fetch(u); return { status: r.status, body: await r.json().catch(() => null) }; }, url);
async function until(fn, msg, tries = 80) {
  for (let i = 0; i < tries; i++) { if (await fn()) return; await new Promise((r) => setTimeout(r, 50)); }
  assert.fail(msg);
}
const fillNum = async (page, sel, v) => { await page.locator(sel).fill(String(v)); await page.locator(sel).blur(); };
const submit = (page, label) => page.getByRole("button", { name: label }).click();

export async function registerAdminStockScenarios({ scenario, openPage, check, baseUrl, admin }) {
  const stamp = crypto.randomUUID().slice(0, 8);
  const cleanupAll = async () => {
    await Oil.deleteMany({ id: new RegExp(stamp) });
    await Bottle.deleteMany({ name: new RegExp(stamp) });
    await Alcohol.deleteMany({ name: new RegExp(stamp) });
    invalidateCatalog();
  };
  const settle = (page) => page.waitForLoadState("networkidle");

  await scenario("Oils: list values, search, sort, capital card, XSS, phone layout", async () => {
    try {
      await Oil.create({ id: `NEG-${stamp}`, oil_name: `زيت مستحق ${stamp}`, oil_cost: 2, oil_quantity: -7 });
      await Oil.create({ id: `H-${stamp}`, oil_name: `"><img src=x onerror=window.__xss=1> ${stamp}`, oil_cost: 1.5, oil_quantity: 40, status: "discontinued" });
      await Oil.create({ id: `OK-${stamp}`, oil_name: `زيت عادي ${stamp}`, oil_cost: 3, oil_quantity: 100 });
      invalidateCatalog();
      const page = await openPage();
      await page.setViewportSize({ width: 1440, height: 900 });
      await openAdmin(page, baseUrl, admin, "/oils");
      await page.getByText(`زيت مستحق ${stamp}`).waitFor();
      const cap = (await get(page, "/api/oils/calculate_oil_capital")).body.data;
      await page.getByText("رأس مال الزيوت").waitFor();
      assert.match(await page.locator("main").innerText(), new RegExp(String(cap.quantity).replace(".", "\\.")));
      const row = page.locator("tr", { hasText: `NEG-${stamp}` });
      assert.match(await row.innerText(), /-7/);
      assert.match(await row.innerText(), /مستحق/);
      assert.match(await page.locator("tr", { hasText: `H-${stamp}` }).innerText(), /متوقف/);
      await assertPageIsXssSafe(page, [`"><img src=x onerror=window.__xss=1> ${stamp}`]);
      await page.locator("#stock-search").fill(`OK-${stamp}`);
      assert.equal(await page.locator("tbody tr").count(), 1);
      await page.locator("#stock-search").fill("");
      await page.locator("#stock-sort").selectOption("qty-asc");
      assert.match(await page.locator("tbody tr").first().innerText(), new RegExp(`NEG-${stamp}`));
      const m = await openPage({ mobile: true });
      await openAdmin(m, baseUrl, admin, "/oils");
      await m.getByText(`زيت عادي ${stamp}`).waitFor();
      assert.equal(await noSideScroll(m), true);
      assert.deepEqual((await small(m)).filter((x) => !/^INPUT/.test(x)), []);
      check(page);
      check(m);
    } finally { await cleanupAll(); }
  });

  await scenario("Oils: add with zero values, duplicate id, edit quantity vs add, delete", async () => {
    try {
      await Oil.create({ id: `NEG-${stamp}`, oil_name: `زيت مستحق ${stamp}`, oil_cost: 2, oil_quantity: -7 });
      invalidateCatalog();
      const page = await openPage();
      await page.setViewportSize({ width: 1440, height: 900 });
      await openAdmin(page, baseUrl, admin, "/oils/new");
      await page.locator("#oil_id").fill(`ZERO-${stamp}`);
      await page.locator("#oil_name").fill(`زيت صفر ${stamp}`);
      await fillNum(page, "#oil_cost", 0);
      await fillNum(page, "#oil_qty", 0);
      await page.locator("#oil_status").selectOption("out of stock");
      await submit(page, "إضافة الزيت");
      await page.waitForURL(/\/admin\/oils$/);
      const made = (await get(page, `/api/oils/ZERO-${stamp}`)).body.data;
      assert.deepEqual([made.oil_cost, made.oil_quantity, made.status], [0, 0, "out of stock"]);

      await page.goto(`${baseUrl}/admin/oils/new`);
      await page.locator("#oil_id").fill(`ZERO-${stamp}`);
      await page.locator("#oil_name").fill("مكرر");
      await fillNum(page, "#oil_cost", 1);
      await submit(page, "إضافة الزيت");
      await page.getByText("رقم الزيت مستخدم مسبقًا").waitFor();

      await page.goto(`${baseUrl}/admin/oils/NEG-${stamp}/edit`);
      await page.locator("#oil_name").waitFor();
      await page.locator("#oil_name").fill(`زيت مستحق معدّل ${stamp}`);
      await submit(page, "حفظ التعديلات");
      await page.waitForURL(/\/admin\/oils$/);
      let o = (await get(page, `/api/oils/NEG-${stamp}`)).body.data;
      assert.deepEqual([o.oil_name, o.oil_quantity], [`زيت مستحق معدّل ${stamp}`, -7], "rename keeps the owed stock");

      await page.goto(`${baseUrl}/admin/oils/NEG-${stamp}/edit`);
      await page.locator("#oil_add").fill("10");
      await page.locator("#oil_qty").fill("999");
      await page.locator("#oil_qty").blur();
      await page.locator("#oil_add").blur();
      await page.getByText(/ويُتجاهل تعديل الكمية الحالية/).waitFor();
      await submit(page, "حفظ التعديلات");
      await page.waitForURL(/\/admin\/oils$/);
      o = (await get(page, `/api/oils/NEG-${stamp}`)).body.data;
      assert.equal(o.oil_quantity, 3, "-7 + 10, the absolute quantity is not applied");

      await page.goto(`${baseUrl}/admin/oils/NEG-${stamp}/edit`);
      await fillNum(page, "#oil_qty", 55);
      await submit(page, "حفظ التعديلات");
      await page.waitForURL(/\/admin\/oils$/);
      assert.equal((await get(page, `/api/oils/NEG-${stamp}`)).body.data.oil_quantity, 55);

      await page.goto(`${baseUrl}/admin/oils/NEG-${stamp}/edit`);
      await page.getByRole("button", { name: "حذف الزيت" }).click();
      await page.getByRole("button", { name: "إلغاء" }).click();
      assert.equal((await get(page, `/api/oils/NEG-${stamp}`)).status, 200, "cancel keeps it");
      await page.getByRole("button", { name: "حذف الزيت" }).click();
      await page.getByRole("alertdialog").getByRole("button", { name: "حذف" }).click();
      await page.waitForURL(/\/admin\/oils$/);
      assert.equal((await get(page, `/api/oils/NEG-${stamp}`)).status, 404);

      await page.goto(`${baseUrl}/admin/oils/NOPE-${stamp}/edit`);
      await page.getByText("الزيت غير موجود").waitFor();
      assert.deepEqual(page.errors.filter((e) => !NOISE.test(e)), []);
    } finally { await cleanupAll(); }
  });

  await scenario("Oils: empty collection shows the empty state with an add button", async () => {
    const page = await openPage();
    await page.route(/\/api\/oils(\/calculate_oil_capital)?$/, (rt) => rt.fulfill({ status: 404, contentType: "application/json", body: JSON.stringify({ success: false, message: "No data found" }) }));
    await openAdmin(page, baseUrl, admin, "/oils");
    await page.getByText("لا توجد زيوت بعد").waitFor();
    assert.ok(await page.getByRole("link", { name: "إضافة زيت" }).count());
    assert.deepEqual(page.errors.filter((e) => !NOISE.test(e)), []);
  });

  await scenario("Bottles: list, add validation, edit rename and add quantity, missing id", async () => {
    try {
      await Bottle.create({ name: `<svg onload=window.__xss=2> ${stamp}`, capacity: 50, cost: 0.4, quantity: -3 });
      await Bottle.create({ name: `زجاجة ${stamp}`, capacity: 100, cost: 0.9, quantity: 20 });
      invalidateCatalog();
      const page = await openPage();
      await page.setViewportSize({ width: 1440, height: 900 });
      await openAdmin(page, baseUrl, admin, "/bottles");
      await page.getByText(`زجاجة ${stamp}`).waitFor();
      await page.getByText("رأس مال الزجاجات").waitFor();
      await assertPageIsXssSafe(page, [`<svg onload=window.__xss=2> ${stamp}`]);
      assert.match(await page.locator("tr", { hasText: `<svg onload` }).innerText(), /مستحق/);
      await page.locator("#stock-search").fill("100");
      assert.equal(await page.locator("tbody tr").count(), 1, "search matches capacity");
      await page.locator("#stock-search").fill("");

      await page.goto(`${baseUrl}/admin/bottles/new`);
      await page.locator("#bottle_name").fill(`جديدة ${stamp}`);
      await fillNum(page, "#bottle_capacity", 0);
      await fillNum(page, "#bottle_cost", -1);
      await submit(page, "إضافة الزجاجة");
      await page.getByText("السعة عدد صحيح بالمل (1 أو أكثر)").waitFor();
      await page.getByText("أدخل تكلفة صحيحة (0 أو أكثر)").waitFor();
      await fillNum(page, "#bottle_capacity", 2.5);
      await submit(page, "إضافة الزجاجة");
      await page.getByText("السعة عدد صحيح بالمل (1 أو أكثر)").waitFor();
      await fillNum(page, "#bottle_capacity", 75);
      await fillNum(page, "#bottle_cost", 0.5);
      await fillNum(page, "#bottle_qty", 12);
      await submit(page, "إضافة الزجاجة");
      await page.waitForURL(/\/admin\/bottles$/);
      const b = (await get(page, "/api/bottles")).body.data.find((x) => x.name === `جديدة ${stamp}`);
      assert.deepEqual([b.capacity, b.cost, b.quantity], [75, 0.5, 12]);

      await page.goto(`${baseUrl}/admin/bottles/${b._id}/edit`);
      await page.locator("#bottle_name").fill(`مسماة ${stamp}`);
      await submit(page, "حفظ التعديلات");
      await page.waitForURL(/\/admin\/bottles$/);
      let after = (await get(page, `/api/bottles/${b._id}`)).body.data;
      assert.deepEqual([after.name, after.quantity], [`مسماة ${stamp}`, 12]);
      await page.goto(`${baseUrl}/admin/bottles/${b._id}/edit`);
      await fillNum(page, "#bottle_add", 8);
      await submit(page, "حفظ التعديلات");
      await page.waitForURL(/\/admin\/bottles$/);
      after = (await get(page, `/api/bottles/${b._id}`)).body.data;
      assert.equal(after.quantity, 20);

      await page.goto(`${baseUrl}/admin/bottles/000000000000000000000000/edit`);
      await page.getByText("الزجاجة غير موجودة").waitFor();
      const m = await openPage({ mobile: true });
      await openAdmin(m, baseUrl, admin, "/bottles/new");
      await m.locator("#bottle_name").waitFor();
      assert.equal(await noSideScroll(m), true);
      assert.deepEqual((await small(m)).filter((x) => !/^INPUT/.test(x)), []);
      assert.deepEqual(page.errors.filter((e) => !NOISE.test(e)), []);
    } finally { await cleanupAll(); }
  });

  await scenario("Alcohol: empty state, create, add stock, hostile round trip, multi-record warning", async () => {
    try {
      const page = await openPage();
      await page.setViewportSize({ width: 1440, height: 900 });
      await page.route(/\/api\/alcohols$/, (rt) => (rt.request().method() === "GET"
        ? rt.fulfill({ status: 404, contentType: "application/json", body: JSON.stringify({ message: "none" }) }) : rt.continue()), { times: 1 });
      await openAdmin(page, baseUrl, admin, "/alcohol");
      await page.getByText("لا يوجد سجل كحول بعد").waitFor();
      const HN = `"><img src=x onerror=window.__xss=2> ${stamp}`;
      await page.locator("#alcnew_name").fill(HN);
      await page.locator("#alcnew_type").fill(`نوع "س" & 'ص'`);
      await fillNum(page, "#alcnew_cost", 0.75);
      await fillNum(page, "#alcnew_qty", 5);
      await submit(page, "إضافة سجل الكحول");
      await until(async () => (await get(page, "/api/alcohols")).body.some((a) => a.name === HN), "alcohol created");
      await page.getByText("المخزون الحالي").first().waitFor();
      await assertPageIsXssSafe(page, ["المخزون الحالي"]);
      const rec = (await get(page, "/api/alcohols")).body.find((a) => a.name === HN);
      const idx = (await get(page, "/api/alcohols")).body.findIndex((a) => a.name === HN);
      await fillNum(page, `#alc${idx}_add`, 10);
      await page.getByRole("button", { name: "حفظ التعديلات" }).nth(idx).click();
      await until(async () => (await get(page, "/api/alcohols")).body.find((a) => a._id === rec._id).quantity === 15, "+10 applied");
      const after = (await get(page, "/api/alcohols")).body.find((a) => a._id === rec._id);
      assert.deepEqual([after.name, after.type], [HN, `نوع "س" & 'ص'`], "hostile strings round trip unchanged");
      assert.equal(await page.locator(`#alc${idx}_name`).inputValue(), HN);

      await Alcohol.create({ name: `ثاني ${stamp}`, type: "x", cost: 1, quantity: 1 });
      await page.goto(`${baseUrl}/admin/alcohol`);
      await page.getByText("يوجد أكثر من سجل كحول").waitFor();
      const m = await openPage({ mobile: true });
      await openAdmin(m, baseUrl, admin, "/alcohol");
      await m.getByText("يوجد أكثر من سجل كحول").waitFor();
      assert.equal(await noSideScroll(m), true);
      assert.deepEqual((await small(m)).filter((x) => !/^INPUT/.test(x)), []);
      assert.deepEqual(page.errors.filter((e) => !NOISE.test(e)), []);
    } finally { await cleanupAll(); }
  });
}
