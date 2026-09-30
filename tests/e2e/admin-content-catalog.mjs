// New React admin: designers, categories, catalogue tagging. registerAdminContentCatalogScenarios({ scenario, openPage, check, baseUrl, admin })
import assert from "node:assert/strict";
import crypto from "node:crypto";
import Brand from "../../backend/models/brand.model.js";
import Category from "../../backend/models/category.model.js";
import Product from "../../backend/models/product.model.js";
import { invalidateCategories } from "../../backend/services/categories.service.js";
import { invalidateCatalog } from "../../backend/store/catalog.js";
import { assertPageIsXssSafe, noSideScroll, openAdmin, small } from "./admin-helpers.mjs";
import { seedLookups, until } from "./admin-product-form-shared.mjs";

const NOISE = /status of (400|404|409)|ERR_FAILED/;
const get = (page, url) => page.evaluate(async (u) => { const r = await fetch(u); return { status: r.status, body: await r.json().catch(() => null) }; }, url);
const smallNoInputs = async (page) => (await small(page)).filter((x) => !/^INPUT/.test(x));

export async function registerAdminContentCatalogScenarios({ scenario, openPage, check, baseUrl, admin }) {
  const stamp = crypto.randomUUID().slice(0, 8);

  await scenario("Designers: create, normalise slug, toggle, delete guard, XSS, phone layout", async () => {
    const created = [];
    let linked;
    try {
      const HOSTILE = `"><img src=x onerror=window.__xss=1> ${stamp}`;
      linked = await Brand.create({ name_ar: HOSTILE, name_en: `Linked ${stamp}` });
      const cat = await Category.create({ key: `Lnk${stamp}`, slug: `lnk-${stamp}`, name_ar: `قسم ${stamp}` });
      invalidateCategories();
      const prod = await Product.create({ p_name: `منتج ${stamp}`, p_image: ".", p_category: cat.key, brand: linked._id, oil_id: "x", oil_percentage: 20, alcohol_percentage: 80, size_list: [{ size: "30", price: 5 }] });
      created.push(cat, prod);
      invalidateCategories();
      invalidateCatalog();
      const page = await openPage();
      await page.setViewportSize({ width: 1440, height: 900 });
      await openAdmin(page, baseUrl, admin, "/brands");
      await assertPageIsXssSafe(page, [HOSTILE]);

      await page.getByRole("button", { name: "إضافة مصمم" }).first().click();
      await page.locator("#bf-name-ar").fill(`ديور ${stamp}`);
      await page.locator("#bf-name-en").fill(`Dior ${stamp}`);
      await page.locator("#bf-slug").fill(`Ux-${stamp}`);
      const post = page.waitForRequest((r) => r.method() === "POST" && r.url().endsWith("/api/brands"));
      await page.getByRole("button", { name: "حفظ" }).click();
      const body = (await post).postDataJSON();
      assert.equal(body.slug, `ux-${stamp}`, "typed uppercase slug is normalised");
      await page.getByText(`ديور ${stamp}`).waitFor();

      const row = page.locator("tbody tr", { hasText: `ديور ${stamp}` });
      await row.getByRole("button", { name: `تعديل ديور ${stamp}` }).click();
      await page.locator("#bf-slug").fill(`dior-${stamp}`);
      await page.getByRole("button", { name: "حفظ" }).click();
      await page.getByText("تم تحديث المصمم").waitFor();
      const mine = () => get(page, "/api/brands").then((r) => r.body.data.find((b) => b.name_en === `Dior ${stamp}`));
      assert.equal((await mine()).slug, `dior-${stamp}`);

      await row.getByRole("switch", { name: `تفعيل ديور ${stamp}` }).click();
      await until(async () => (await mine()).active === false, "deactivated");

      await page.locator("tbody tr", { hasText: `Linked ${stamp}` }).getByRole("button", { name: /^حذف/ }).click();
      await page.getByRole("alertdialog").getByRole("button", { name: "حذف" }).click();
      await page.getByText(/لا يمكن حذف مصمم مرتبط بمنتجات/).waitFor();
      assert.ok(await Brand.exists({ _id: linked._id }), "linked brand stays");

      await row.getByRole("button", { name: `حذف ديور ${stamp}` }).click();
      await page.getByRole("alertdialog").getByRole("button", { name: "حذف" }).click();
      await until(async () => !(await mine()), "unused brand deleted");

      const m = await openPage({ mobile: true });
      await openAdmin(m, baseUrl, admin, "/brands");
      await m.getByText(`Linked ${stamp}`).waitFor();
      assert.equal(await m.locator("table").count(), 0);
      await m.getByRole("button", { name: "إضافة مصمم" }).first().click();
      await m.locator("#bf-name-ar").waitFor();
      assert.equal(await noSideScroll(m), true);
      assert.deepEqual(await smallNoInputs(m), []);
      assert.deepEqual(page.errors.filter((e) => !NOISE.test(e)), []);
      assert.deepEqual(m.errors.filter((e) => !NOISE.test(e)), []);
    } finally {
      await Product.deleteMany({ p_name: new RegExp(stamp) });
      await Category.deleteMany({ key: `Lnk${stamp}` });
      await Brand.deleteMany({ name_en: new RegExp(stamp) });
      invalidateCategories();
      invalidateCatalog();
    }
  });

  await scenario("Categories: create, immutable key, icon clears, hide, reorder, delete guard, XSS, phone layout", async () => {
    try {
      const HOSTILE = `<b onmouseover=window.__xss=2>${stamp}`;
      await Category.create({ key: `Ra${stamp}`, slug: `ra-${stamp}`, name_ar: `أول ${stamp}`, sort: 5000, icon: "truck" });
      await Category.create({ key: `Rb${stamp}`, slug: `rb-${stamp}`, name_ar: HOSTILE, sort: 5001 });
      await Category.create({ key: `Rc${stamp}`, slug: `rc-${stamp}`, name_ar: `مرتبط ${stamp}`, sort: 5002 });
      await Product.create({ p_name: `منتج ${stamp}`, p_image: ".", p_category: `Rc${stamp}`, oil_id: "x", oil_percentage: 20, alcohol_percentage: 80, size_list: [{ size: "30", price: 5 }] });
      invalidateCategories();
      const page = await openPage();
      await page.setViewportSize({ width: 1440, height: 900 });
      await openAdmin(page, baseUrl, admin, "/categories");
      await assertPageIsXssSafe(page, [HOSTILE]);
      const list = () => get(page, "/api/categories").then((r) => r.body.data);
      const find = async (key) => (await list()).find((c) => c.key === key);

      await page.getByRole("button", { name: "إضافة قسم" }).first().click();
      await page.locator("#cf-key").fill(`Oud${stamp}`);
      await page.locator("#cf-slug").fill(`oud-${stamp}`);
      await page.locator("#cf-name-ar").fill(`عطور العود ${stamp}`);
      const post = page.waitForRequest((r) => r.method() === "POST" && r.url().endsWith("/api/categories"));
      await page.getByRole("button", { name: "حفظ" }).click();
      assert.equal((await post).postDataJSON().key, `Oud${stamp}`);
      await page.getByText(`عطور العود ${stamp}`).waitFor();

      const oudRow = page.locator("tbody tr", { hasText: `عطور العود ${stamp}` });
      await oudRow.getByRole("button", { name: `تعديل عطور العود ${stamp}` }).click();
      assert.equal(await page.locator("#cf-key").isDisabled(), true, "key immutable on edit");
      await page.getByRole("button", { name: "إلغاء" }).click();

      const raRow = page.locator("tbody tr", { hasText: `أول ${stamp}` });
      await raRow.getByRole("button", { name: `تعديل أول ${stamp}` }).click();
      assert.equal(await page.locator("#cf-icon").inputValue(), "truck");
      await page.locator("#cf-icon").selectOption("");
      await page.getByRole("button", { name: "حفظ" }).click();
      await page.getByText("تم تحديث القسم").waitFor();
      assert.ok(!(await find(`Ra${stamp}`)).icon, "clearing the icon persists");

      await oudRow.getByRole("switch", { name: `إظهار عطور العود ${stamp}` }).click();
      await until(async () => (await find(`Oud${stamp}`)).visible === false, "hidden");

      await page.getByRole("button", { name: `رفع ${HOSTILE}` }).click();
      await until(async () => { const l = await list(); return l.findIndex((c) => c.key === `Rb${stamp}`) < l.findIndex((c) => c.key === `Ra${stamp}`); }, "reordered");

      await page.locator("tbody tr", { hasText: `مرتبط ${stamp}` }).getByRole("button", { name: /^حذف/ }).click();
      await page.getByRole("alertdialog").getByRole("button", { name: "حذف" }).click();
      await page.getByText(/لا يمكن حذف قسم مرتبط بمنتجات/).waitFor();
      assert.ok(await find(`Rc${stamp}`));

      const m = await openPage({ mobile: true });
      await openAdmin(m, baseUrl, admin, "/categories");
      await m.getByText(`مرتبط ${stamp}`).waitFor();
      assert.equal(await m.locator("table").count(), 0);
      assert.equal(await noSideScroll(m), true);
      assert.deepEqual(await smallNoInputs(m), []);
      assert.deepEqual(page.errors.filter((e) => !NOISE.test(e)), []);
    } finally {
      await Product.deleteMany({ p_name: new RegExp(stamp) });
      await Category.deleteMany({ key: { $in: [`Ra${stamp}`, `Rb${stamp}`, `Rc${stamp}`, `Oud${stamp}`] } });
      invalidateCategories();
      invalidateCatalog();
    }
  });

  await scenario("Catalogue tagging: row save, brand assign and clear, batch save, filter keeps edits, empty state, XSS", async () => {
    let s;
    try {
      s = await seedLookups(stamp);
      const HOSTILE = `<svg onload=window.__xss=3> ${stamp}`;
      const a = await s.product({ p_name: `تصنيف أ ${stamp}` });
      const b = await s.product({ p_name: `تصنيف ب ${stamp}` });
      const h = await s.product({ p_name: HOSTILE, families: ["oud"] });
      const page = await openPage();
      await page.setViewportSize({ width: 1440, height: 900 });
      await openAdmin(page, baseUrl, admin, "/catalog");
      await assertPageIsXssSafe(page, [HOSTILE]);
      const row = (name) => page.locator("tbody tr", { hasText: name });
      const api = (id) => get(page, `/api/products/${id}`).then((r) => r.body.data);

      const ra = row(`تصنيف أ ${stamp}`);
      await ra.locator("select").first().selectOption(s.cat.key);
      await ra.locator("label", { hasText: "مسك" }).click();
      await ra.locator("select").nth(1).selectOption(String(s.brand._id));
      await ra.getByRole("button", { name: "حفظ", exact: true }).click();
      await ra.getByText("تم الحفظ ✓").waitFor();
      let p = await api(a._id);
      assert.deepEqual([p.p_category, p.families, String(p.brand?._id ?? p.brand)], [s.cat.key, ["musk"], String(s.brand._id)]);

      await ra.locator("select").nth(1).selectOption("");
      await ra.getByRole("button", { name: "حفظ", exact: true }).click();
      await ra.getByText("تم الحفظ ✓").waitFor();
      assert.equal((await api(a._id)).brand ?? null, null, "brand cleared");

      const rb = row(`تصنيف ب ${stamp}`);
      await ra.locator("label", { hasText: "عنبر" }).click();
      await rb.locator("label", { hasText: "خشبي" }).click();
      await page.getByRole("button", { name: /^حفظ المعدّل \(2\)$/ }).click();
      await until(async () => (await api(a._id)).families.includes("amber") && (await api(b._id)).families.includes("woody"), "both dirty rows saved");

      await rb.locator("label", { hasText: "فواكه" }).click();
      await page.locator("#unclassifiedOnly").check();
      await page.locator("#unclassifiedOnly").uncheck();
      assert.equal(await rb.getByText("غير محفوظ").count(), 1, "unsaved edit survives the filter toggle");

      const m = await openPage({ mobile: true });
      await openAdmin(m, baseUrl, admin, "/catalog");
      await m.getByText(`تصنيف أ ${stamp}`).waitFor();
      assert.equal(await m.locator("table").count(), 0);
      assert.equal(await noSideScroll(m), true);

      const e = await openPage();
      await e.route(/\/api\/products$/, (rt) => rt.fulfill({ status: 404, contentType: "application/json", body: JSON.stringify({ success: false, message: "No products found" }) }));
      await openAdmin(e, baseUrl, admin, "/catalog");
      await e.getByText("لا توجد منتجات بعد").waitFor();
      assert.deepEqual(page.errors.filter((x) => !NOISE.test(x)), []);
      void h;
    } finally { await s?.cleanup(); }
  });
}
