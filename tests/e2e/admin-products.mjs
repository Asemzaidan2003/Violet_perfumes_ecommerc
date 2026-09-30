// New React admin products list. registerAdminProductsScenarios({ scenario, openPage, check, baseUrl, admin })
import assert from "node:assert/strict";
import crypto from "node:crypto";
import Brand from "../../backend/models/brand.model.js";
import Category from "../../backend/models/category.model.js";
import Order from "../../backend/models/order.model.js";
import Product from "../../backend/models/product.model.js";
import { invalidateCategories } from "../../backend/services/categories.service.js";
import { invalidateCatalog } from "../../backend/store/catalog.js";
import { assertPageIsXssSafe, noSideScroll, openAdmin, small } from "./admin-helpers.mjs";

// Polls until fn() is truthy (menus animate in, so one-shot size reads are unreliable).
async function expect(fn, msg) {
  for (let i = 0; i < 40; i++) { if (await fn()) return; await new Promise((r) => setTimeout(r, 50)); }
  assert.fail(msg);
}
const NET_NOISE = /status of 404|ERR_FAILED/;

export async function registerAdminProductsScenarios({ scenario, openPage, check, baseUrl, admin }) {
  const stamp = crypto.randomUUID().slice(0, 8);
  const NAME = `عطر قابل للإخفاء ${stamp}`;
  const HOSTILE = `<svg onload=window.__xss=1> ${stamp}`;
  const BRAND = `<img src=x onerror=window.__xss=3> ${stamp}`;
  const CAT_LABEL = `قسم "الأزهار" & ${stamp}`;
  const seed = {};
  async function seedAll() {
    seed.brand = await Brand.create({ name_ar: BRAND, name_en: `Brand ${stamp}` });
    seed.cat = await Category.create({ key: `Cat${stamp}`, slug: `cat-${stamp}`, name_ar: CAT_LABEL });
    seed.cat2 = await Category.create({ key: `Dog${stamp}`, slug: `dog-${stamp}`, name_ar: `قسم آخر ${stamp}` });
    invalidateCategories();
    const base = { oil_id: `OIL-${stamp}`, oil_percentage: 20, alcohol_percentage: 80, p_image: "." };
    seed.p1 = await Product.create({ ...base, p_name: NAME, p_category: seed.cat.key, brand: seed.brand._id, size_list: [{ size: "30", price: 15.5 }, { size: "50", price: 24 }] });
    seed.p3 = await Product.create({ ...base, p_image: "https://img.example.test/a.png", p_name: `عطر صورة خارجية ${stamp}`, p_category: seed.cat.key, size_list: [{ size: "30", price: 5 }] });
    seed.p2 = await Product.create({ ...base, p_name: HOSTILE, p_category: seed.cat2.key, status: "out of stock", size_list: [{ size: "30", price: 9 }] });
    invalidateCatalog();
  }
  async function cleanup() {
    await Product.deleteMany({ _id: { $in: [seed.p1, seed.p2, seed.p3].filter(Boolean).map((d) => d._id) } });
    if (seed.brand) await Brand.deleteOne({ _id: seed.brand._id });
    await Category.deleteMany({ _id: { $in: [seed.cat, seed.cat2].filter(Boolean).map((d) => d._id) } });
    invalidateCategories();
    invalidateCatalog();
    for (const k of Object.keys(seed)) delete seed[k];
  }
  const apiVisible = (page, id) => page.evaluate(async (i) => (await (await fetch(`/api/products/${i}`)).json()).data.visible, String(id));
  const onStore = async (page, name) => {
    await page.goto(`${baseUrl}/`);
    await page.waitForLoadState("networkidle");
    return page.locator(".card-name", { hasText: name }).count();
  };

  await scenario("Products list (new admin): rows, badges, visibility switch, search", async () => {
    try {
      await seedAll();
      const page = await openPage();
      await page.setViewportSize({ width: 1440, height: 900 });
      await page.route("https://img.example.test/**", (rt) => rt.fulfill({ status: 200, contentType: "image/png", body: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==", "base64") }));
      await openAdmin(page, baseUrl, admin, "/products");
      const row = page.locator("tr", { hasText: NAME });
      await row.waitFor();
      await page.locator("tr", { hasText: HOSTILE }).waitFor();
      assert.equal(await page.locator("table").count(), 1);
      // Row content: brand, Arabic category label, percentages, status, sizes, badges, edit link.
      const text = await row.innerText();
      for (const s of [BRAND, CAT_LABEL, "20% زيت / 80% كحول", "متوفر", "30: 15.5 د.أ", "50: 24 د.أ", "بدون صورة خاصة"]) assert.ok(text.includes(s), `row shows ${s}`);
      assert.ok(!text.includes("مخفي"), "not hidden yet");
      assert.ok((await page.locator("tr", { hasText: HOSTILE }).innerText()).includes("غير متوفر"));
      assert.equal(await row.locator("img").count(), 0, "placeholder icon for '.'");
      const ext = page.locator("tr", { hasText: `عطر صورة خارجية ${stamp}` });
      await ext.waitFor();
      assert.equal(await ext.locator("img").count(), 1, "thumbnail for a non-/img/ image");
      assert.equal(await ext.getByText("بدون صورة خاصة").count(), 0, "no badge when a thumbnail shows");
      assert.equal(await row.locator(`a[href="/admin/products/${seed.p1._id}/edit"]`).count(), 1);
      await assertPageIsXssSafe(page, [HOSTILE, BRAND, CAT_LABEL]);

      // Desktop sidebar: the add menu and the Products nav link.
      const side = page.locator("aside");
      await side.getByRole("button", { name: "إضافة جديد" }).click();
      for (const [label, href] of [["أضف عطر جديد", "/admin/products/new"], ["أضف زيت جديد", "/admin/oils/new"], ["أضف زجاجة جديدة", "/admin/bottles/new"]]) {
        const item = page.getByRole("menuitem", { name: label });
        await item.waitFor();
        assert.equal(await item.getAttribute("href"), href);
        await expect(async () => (await item.boundingBox()).height >= 44, `${label} >= 44px`);
      }
      assert.equal(await page.getByRole("menuitem").count(), 3);
      await page.keyboard.press("Escape");
      await page.getByRole("menuitem").first().waitFor({ state: "detached" });
      await side.getByRole("button", { name: "إضافة جديد" }).click();
      await page.getByRole("menuitem", { name: "أضف زجاجة جديدة" }).click();
      await page.waitForURL(/\/admin\/bottles\/new$/);
      await side.getByRole("link", { name: "المنتجات", exact: true }).click();
      await page.waitForURL(/\/admin\/products$/);
      await row.waitFor();

      // Search: Arabic category label, key, brand, name.
      const search = page.getByLabel("ابحث بالاسم أو المصمم أو الفئة");
      await search.fill(CAT_LABEL);
      await page.locator("tr", { hasText: HOSTILE }).waitFor({ state: "detached" });
      assert.equal(await row.count(), 1);
      await search.fill(seed.cat2.key.toUpperCase());
      await row.waitFor({ state: "detached" });
      await page.locator("tr", { hasText: HOSTILE }).waitFor();
      await search.fill(BRAND);
      await page.locator("tr", { hasText: HOSTILE }).waitFor({ state: "detached" });
      await row.waitFor();
      await search.fill(`zz-${stamp}-none`);
      await page.getByText("لا توجد منتجات مطابقة").waitFor();
      await search.fill("");
      await row.waitFor();
      // Category chip.
      await page.getByRole("button", { name: `قسم آخر ${stamp}` }).click();
      await row.waitFor({ state: "detached" });
      await page.getByRole("button", { name: "الكل" }).click();
      await row.waitFor();

      // Store lists it before, hides it after (asserted from the DOM after waiting), lists it again after toggling back.
      const store = await openPage();
      assert.ok(await onStore(store, NAME) >= 1, "listed on the store while visible");
      const sw = row.getByRole("switch", { name: `ظاهر في المتجر — ${NAME}` });
      assert.equal(await sw.getAttribute("aria-checked"), "true");
      let puts = 0;
      page.on("request", (r) => { if (r.method() === "PUT" && r.url().endsWith(`/api/products/${seed.p1._id}`)) puts += 1; });
      const put = page.waitForResponse((r) => r.url().endsWith(`/api/products/${seed.p1._id}`) && r.request().method() === "PUT");
      await sw.dblclick(); // rapid double toggle: the second click must not send a second PUT
      assert.equal((await put).status(), 200);
      await row.getByText("مخفي", { exact: true }).waitFor();
      await page.getByText("تم إخفاء المنتج عن المتجر").waitFor();
      await page.waitForFunction(() => document.querySelector('[role=switch][aria-checked=false]:not([disabled])'));
      assert.equal(puts, 1, "double toggle sends one PUT");
      assert.equal(await apiVisible(page, seed.p1._id), false);
      assert.equal(await onStore(store, NAME), 0, "gone from the store");
      await store.reload();
      await store.waitForLoadState("networkidle");
      assert.equal(await store.locator(".card-name", { hasText: NAME }).count(), 0, "still gone after reload");

      await sw.click();
      await row.getByText("مخفي", { exact: true }).waitFor({ state: "detached" });
      assert.equal(await apiVisible(page, seed.p1._id), true);
      assert.ok(await onStore(store, NAME) >= 1, "back on the store");
      assert.equal(await noSideScroll(page), true);
      check(page);
      check(store);
    } finally {
      await cleanup();
    }
  });

  await scenario("Products list (new admin): a failed visibility change reverts", async () => {
    try {
      await seedAll();
      const page = await openPage();
      await page.setViewportSize({ width: 1440, height: 900 });
      await openAdmin(page, baseUrl, admin, "/products");
      const row = page.locator("tr", { hasText: NAME });
      await row.waitFor();
      const sw = row.getByRole("switch");
      await page.route(new RegExp(`/api/products/${seed.p1._id}$`), (rt) => (rt.request().method() === "PUT" ? rt.abort() : rt.continue()));
      await sw.click();
      await page.getByText("تعذّر الاتصال بالخادم").waitFor();
      await page.waitForFunction((n) => { const s = [...document.querySelectorAll("tr")].find((r) => r.innerText.includes(n))?.querySelector("[role=switch]"); return s && s.getAttribute("aria-checked") === "true" && !s.disabled; }, NAME);
      assert.equal(await row.getByText("مخفي", { exact: true }).count(), 0);
      assert.equal(await apiVisible(page, seed.p1._id), true);
      // A server refusal shows the server's Arabic message verbatim.
      await page.unroute(new RegExp(`/api/products/${seed.p1._id}$`));
      await page.route(new RegExp(`/api/products/${seed.p1._id}$`), (rt) => (rt.request().method() === "PUT"
        ? rt.fulfill({ status: 400, contentType: "application/json", body: JSON.stringify({ success: false, message: "رفض الخادم التعديل" }) }) : rt.continue()));
      await sw.click();
      await page.getByText("رفض الخادم التعديل").waitFor();
      assert.equal(await sw.getAttribute("aria-checked"), "true");
      assert.deepEqual(page.errors.filter((e) => !NET_NOISE.test(e) && !/status of 400/.test(e)), []);
    } finally {
      await cleanup();
    }
  });

  await scenario("Products list (new admin): empty catalogue and unknown routes", async () => {
    const page = await openPage();
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.route(/\/api\/products$/, (rt) => rt.fulfill({ status: 404, contentType: "application/json", body: JSON.stringify({ success: false, message: "No products found" }) }));
    await openAdmin(page, baseUrl, admin, "/products");
    await page.getByText("لا توجد منتجات بعد").waitFor();
    assert.equal(await page.getByRole("alert").count(), 0);
    await page.getByRole("link", { name: "أضف أول منتج" }).click();
    await page.waitForURL(/\/admin\/products\/new$/);
    await page.locator('[data-ready="true"]').waitFor();
    assert.deepEqual(page.errors.filter((e) => !NET_NOISE.test(e)), []);
  });

  await scenario("Products list (new admin): phone layout and add menu", async () => {
    try {
      await seedAll();
      const page = await openPage({ mobile: true });
      await openAdmin(page, baseUrl, admin, "/products");
      const card = page.locator("li", { hasText: NAME });
      await card.waitFor();
      assert.equal(await page.locator("table").count(), 0, "cards, not a table, on a phone");
      assert.equal(await noSideScroll(page), true);
      assert.deepEqual(await small(page), []);
      // Add menu is reachable in the top bar and every entry is a real 44px router link.
      assert.ok((await page.getByRole("button", { name: "إضافة جديد" }).boundingBox()).height >= 44);
      await page.getByRole("button", { name: "إضافة جديد" }).click();
      const links = [["أضف عطر جديد", "/admin/products/new"], ["أضف زيت جديد", "/admin/oils/new"], ["أضف زجاجة جديدة", "/admin/bottles/new"]];
      for (const [label, href] of links) {
        const item = page.getByRole("menuitem", { name: label });
        await item.waitFor();
        assert.equal(await item.locator("xpath=descendant-or-self::a").first().getAttribute("href"), href);
        await expect(async () => (await item.boundingBox()).height >= 44, `${label} >= 44px`); // waits out the open animation
      }
      await page.getByRole("menuitem", { name: "أضف زيت جديد" }).click();
      await page.waitForURL(/\/admin\/oils\/new$/);
      await page.locator("#oil_id").waitFor();
      await page.goBack();
      await card.waitFor();
      // Switch on the phone: 44px hit area and it works.
      const sw = card.getByRole("switch", { name: `ظاهر في المتجر — ${NAME}` });
      assert.ok((await sw.boundingBox()).height >= 44);
      const put = page.waitForResponse((r) => r.url().endsWith(`/api/products/${seed.p1._id}`) && r.request().method() === "PUT");
      await sw.click();
      assert.equal((await put).status(), 200);
      await card.getByText("مخفي", { exact: true }).waitFor();
      assert.deepEqual(await small(page), []);
      assert.equal(await noSideScroll(page), true);
      await page.locator("li", { hasText: HOSTILE }).waitFor();
      await assertPageIsXssSafe(page, [HOSTILE, BRAND]);
      check(page);
    } finally {
      await cleanup();
    }
  });

  await scenario("Products list (new admin): phone header with pending-orders pill keeps targets apart", async () => {
    let order;
    try {
      const p = await Product.create({ p_name: `عطر ترويسة ${stamp}`, p_image: ".", p_category: "Men", oil_id: "OIL1", oil_percentage: 20, alcohol_percentage: 80, size_list: [{ size: "30", price: 22 }] });
      seed.p1 = p;
      order = await Order.create({
        products: [{ product_id: p._id, p_name: p.p_name, product_size: "30", quantity: 1, selling_price: 22, total_revenue: 22, oil_id: "OIL1", oil_ml: 6, alcohol_ml: 24 }],
        total_items: 1, total_revenue: 22, total_cost: 5, total_profit: 17, payment_method: "Cash", delivery_fee: 0, final_total: 22, status: "pending", source: "online", stock_deducted: false,
      });
      const page = await openPage({ mobile: true });
      await openAdmin(page, baseUrl, admin, "/products");
      const pill = page.locator("header a", { hasText: /^الطلبات \(/ });
      await pill.waitFor();
      assert.equal(await noSideScroll(page), true);
      const boxes = await page.evaluate(() => [...document.querySelectorAll("header a, header button")].map((el) => { const r = el.getBoundingClientRect(); return { n: el.getAttribute("aria-label") || el.textContent.trim(), l: r.left, r: r.right, t: r.top, b: r.bottom, w: r.width, h: r.height }; }).filter((x) => x.w > 0));
      assert.ok(boxes.length >= 4, "pill, add, theme and logout are in the header");
      for (const x of boxes) { assert.ok(x.h >= 44 && x.w >= 44, `${x.n} is at least 44px`); assert.ok(x.l >= 0 && x.r <= 375, `${x.n} inside the viewport`); }
      for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
        const a = boxes[i], b = boxes[j];
        const gapX = Math.max(a.l - b.r, b.l - a.r), gapY = Math.max(a.t - b.b, b.t - a.b);
        assert.ok(Math.max(gapX, gapY) >= 8 - 0.5, `${a.n} / ${b.n} are 8px apart`);
      }
      check(page);
    } finally {
      if (order) await Order.deleteOne({ _id: order._id });
      await cleanup();
    }
  });
}
