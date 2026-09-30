// New React admin product form (add). registerAdminProductFormScenarios({ scenario, openPage, check, baseUrl, admin })
import assert from "node:assert/strict";
import crypto from "node:crypto";
import Product from "../../backend/models/product.model.js";
import { assertPageIsXssSafe, noSideScroll, openAdmin } from "./admin-helpers.mjs";
import { apiByName, NET_NOISE, ready, seedLookups, until } from "./admin-product-form-shared.mjs";

export async function registerAdminProductFormScenarios(ctx) {
  const { scenario, openPage, check, baseUrl, admin } = ctx;
  const stamp = crypto.randomUUID().slice(0, 8);
  let s;
  const NAME = `  عطر <svg onload=window.__xss=2> جديد ${stamp}  `;
  const fill = async (page, { name = NAME, oil = true } = {}) => {
    await page.locator("#p_name").fill(name);
    await page.locator("#p_category").selectOption(s.cat.key);
    if (oil) await pickOil(page, `OIL-${stamp}`);
    await page.locator("#oil_percentage").fill("0");
    await page.locator("#alcohol_percentage").fill("٠");
    await page.locator("#size-0").fill("30ml");
    await page.locator("#size-price-0").fill("١٢٫٥");
  };
  async function pickOil(page, term) {
    await page.getByRole("button", { name: /اختيار زيت|تغيير الزيت/ }).click();
    const dlg = page.getByRole("dialog");
    await dlg.waitFor();
    await dlg.getByLabel("بحث").fill(term);
    await dlg.getByRole("button", { name: new RegExp(term) }).click();
    await dlg.waitFor({ state: "detached" });
  }

  await scenario("Product form: add a product (0 percentages, decimals, offer end, oil picker)", async () => {
    try {
      s = await seedLookups(stamp);
      const page = await openPage();
      await page.setViewportSize({ width: 1440, height: 900 });
      const posts = [];
      page.on("request", (r) => { if (r.method() === "POST" && r.url().endsWith("/api/products")) posts.push(r.postDataJSON()); });
      await openAdmin(page, baseUrl, admin, "/products/new");
      await ready(page);

      // Hidden categories are offered; labels render literally.
      const opts = await page.locator("#p_category option").allTextContents();
      assert.ok(opts.some((t) => t.includes(`<b onmouseover=window.__xss=4>${stamp}`) && t.includes("(مخفية)")), "hidden category offered");
      assert.ok(opts.some((t) => t.includes(`قسم "الأزهار" & ${stamp}`)));

      // Empty submit: Arabic errors, nothing sent, focus on the first invalid field.
      await page.getByRole("button", { name: "إضافة المنتج" }).click();
      for (const m of ["اسم المنتج مطلوب", "اختر الفئة", "اختر الزيت", "نسبة الزيت مطلوبة", "نسبة الكحول مطلوبة", "الحجم يجب أن يكون رقمًا موجبًا", "السعر مطلوب"]) await page.locator('p[role="alert"]', { hasText: m }).first().waitFor();
      assert.equal(posts.length, 0);
      await until(async () => (await page.evaluate(() => document.activeElement?.id)) === "p_name", "focus moves to the first invalid field");

      // Oil picker: searches by id AND name, hostile name literal, 44px targets, Arabic 44px close.
      await page.getByRole("button", { name: "اختيار زيت" }).click();
      const dlg = page.getByRole("dialog");
      await dlg.waitFor();
      await dlg.getByLabel("بحث").fill(`ZED-${stamp}`);
      await dlg.getByRole("button", { name: `زيت ثانٍ ${stamp}` }).waitFor();
      assert.equal(await dlg.getByRole("button", { name: s.oilName }).count(), 0);
      await dlg.getByLabel("بحث").fill(`زيت ${stamp}`);
      await dlg.getByRole("button", { name: s.oilName }).waitFor();
      assert.equal(await dlg.getByText(s.oilName).count(), 1, "hostile oil name is text");
      await until(async () => (await dlg.getByRole("button", { name: "إغلاق" }).boundingBox()).height >= 44, "close >= 44px");
      const oilBox = await dlg.getByRole("button", { name: s.oilName }).boundingBox();
      assert.ok(oilBox.height >= 44);
      assert.equal(await page.evaluate(() => window.__xss), undefined);
      await dlg.getByLabel("بحث").fill("no-such-oil-zz");
      await dlg.getByText("لا توجد زيوت مطابقة").waitFor();
      await dlg.getByRole("button", { name: "إغلاق" }).click();
      await dlg.waitFor({ state: "detached" });

      await fill(page);
      await page.getByTestId("selected-oil").getByText(s.oilName).waitFor();
      await page.locator("#p_offer_percentage").fill("12.5");
      await page.locator("#offer_ends_at").fill("2031-01-02T03:04");
      await assertPageIsXssSafe(page, [s.oilName]);
      await page.getByText("سيُحفظ:").waitFor(); // "30ml" preview

      // Clear/change oil.
      await page.getByRole("button", { name: "إزالة الزيت" }).click();
      assert.equal(await page.getByTestId("selected-oil").count(), 0);
      await pickOil(page, `OIL-${stamp}`);

      // Double click sends a single POST; success toast + list.
      await page.getByRole("button", { name: "إضافة المنتج" }).dblclick();
      await page.getByText("تمت إضافة المنتج").waitFor();
      await page.waitForURL(/\/admin\/products$/);
      assert.equal(posts.length, 1, "one POST");
      const body = posts[0];
      assert.equal(body.p_name, NAME.trim());
      assert.equal(body.oil_percentage, 0);
      assert.equal(body.alcohol_percentage, 0);
      assert.equal(body.p_offer_percentage, 12.5);
      assert.equal(body.offer_ends_at, new Date(2031, 0, 2, 3, 4).toISOString());
      assert.deepEqual(body.size_list, [{ size: "30", price: 12.5 }]);
      assert.equal(body.p_image, ".");
      assert.equal(body.oil_id, `OIL-${stamp}`);
      assert.equal(body.visible, true);
      assert.ok(!("brand" in body), "no brand key when none chosen");
      const saved = await apiByName(page, NAME.trim());
      assert.ok(saved, "product exists");
      s.prods.push(saved._id);
      assert.equal(saved.oil_percentage, 0);
      assert.equal(saved.alcohol_percentage, 0);
      assert.equal(saved.p_offer_percentage, 12.5);
      assert.equal(new Date(saved.offer_ends_at).toISOString(), new Date(2031, 0, 2, 3, 4).toISOString());
      assert.equal(saved.size_list[0].price, 12.5);
      await page.locator("tr", { hasText: `جديد ${stamp}` }).waitFor();
      check(page);
    } finally {
      await s?.cleanup();
    }
  });

  await scenario("Product form: validation, duplicate name and server errors", async () => {
    try {
      s = await seedLookups(stamp);
      const dup = await s.product({ p_name: `اسم مكرر ${stamp}` });
      const page = await openPage();
      await page.setViewportSize({ width: 1440, height: 900 });
      let posts = 0;
      page.on("request", (r) => { if (r.method() === "POST" && r.url().endsWith("/api/products")) posts += 1; });
      await openAdmin(page, baseUrl, admin, "/products/new");
      await ready(page);
      await fill(page, { name: dup.p_name });
      // Client-side rules, all before any request.
      await page.locator("#p_image").fill("http://x.test/a.png");
      await page.locator("#oil_percentage").fill("101");
      await page.locator("#size-0").fill("abc");
      await page.locator("#size-price-0").fill("-1");
      await page.getByRole("button", { name: "إضافة المنتج" }).click();
      await page.getByText("نسبة الزيت بين 0 و100").waitFor();
      await page.getByText(/لا يُقبل http/).first().waitFor();
      await page.getByText("الحجم يجب أن يكون رقمًا موجبًا (مثال: 30)").waitFor();
      await page.getByText("السعر لا يقل عن صفر").waitFor();
      assert.equal(posts, 0);
      await page.getByRole("button", { name: "حذف الحجم 1" }).click();
      await page.getByRole("button", { name: "إضافة المنتج" }).click();
      await page.getByText("أضف حجمًا واحدًا على الأقل").waitFor();
      await page.getByRole("button", { name: "إضافة حجم" }).click();
      await page.locator("#size-0").fill("50");
      await page.locator("#size-price-0").fill("0");
      await page.locator("#oil_percentage").fill("20");
      await page.locator("#p_image").fill("https://x.test/a.png");
      // Duplicate name: the server's 409 becomes a field error, the form stays usable.
      await page.getByRole("button", { name: "إضافة المنتج" }).click();
      await page.getByText("اسم المنتج مستخدم مسبقًا").waitFor();
      assert.equal(posts, 1);
      assert.match(page.url(), /\/products\/new$/);
      await until(async () => await page.getByRole("button", { name: "إضافة المنتج" }).isEnabled(), "submit re-enabled");
      // Other server messages verbatim; network failure in Arabic.
      await page.locator("#p_name").fill(`اسم جديد ${stamp}`);
      await page.route(/\/api\/products$/, (rt) => rt.request().method() === "POST"
        ? rt.fulfill({ status: 400, contentType: "application/json", body: JSON.stringify({ success: false, message: "فئة غير صالحة" }) }) : rt.continue());
      await page.getByRole("button", { name: "إضافة المنتج" }).click();
      await page.getByText("فئة غير صالحة").first().waitFor();
      await page.unroute(/\/api\/products$/);
      await page.route(/\/api\/products$/, (rt) => (rt.request().method() === "POST" ? rt.abort() : rt.continue()));
      await until(async () => await page.getByRole("button", { name: "إضافة المنتج" }).isEnabled(), "submit re-enabled");
      await page.getByRole("button", { name: "إضافة المنتج" }).click();
      await page.getByText("تعذّر الاتصال بالخادم").waitFor();
      assert.equal(await Product.countDocuments({ p_name: `اسم جديد ${stamp}` }), 0, "nothing saved");
      assert.deepEqual(page.errors.filter((e) => !NET_NOISE.test(e)), []);
    } finally {
      await s?.cleanup();
    }
  });

  await scenario("Product form: unsaved-change guard (link and browser Back)", async () => {
    try {
      s = await seedLookups(stamp);
      const page = await openPage();
      await page.setViewportSize({ width: 1440, height: 900 });
      await openAdmin(page, baseUrl, admin, "/products");
      await page.getByRole("link", { name: "إضافة منتج" }).first().click();
      await ready(page);
      // Clean form: leaving is free.
      await page.getByRole("link", { name: "رجوع" }).click();
      await page.waitForURL(/\/admin\/products$/);
      await page.getByRole("link", { name: "إضافة منتج" }).first().click();
      await ready(page);
      await page.locator("#p_name").fill(`غير محفوظ ${stamp}`);
      const nav = page.locator("aside").getByRole("link", { name: "المنتجات", exact: true });
      await nav.click();
      await page.getByRole("alertdialog").getByText("تغييرات غير محفوظة").waitFor();
      await page.getByRole("button", { name: "إلغاء" }).click();
      await page.getByRole("alertdialog").waitFor({ state: "detached" });
      assert.match(page.url(), /\/products\/new$/);
      assert.equal(await page.locator("#p_name").inputValue(), `غير محفوظ ${stamp}`);
      await nav.click();
      await page.getByRole("button", { name: "مغادرة" }).click();
      await page.waitForURL(/\/admin\/products$/);
      // Browser Back prompts too.
      await page.getByRole("link", { name: "إضافة منتج" }).first().click();
      await ready(page);
      await page.locator("#p_name").fill(`غير محفوظ ${stamp}`);
      await page.goBack();
      await page.getByRole("alertdialog").getByText("تغييرات غير محفوظة").waitFor();
      await page.getByRole("button", { name: "إلغاء" }).click();
      await page.getByRole("alertdialog").waitFor({ state: "detached" });
      assert.match(page.url(), /\/products\/new$/);
      await page.goBack();
      await page.getByRole("button", { name: "مغادرة" }).click();
      await page.waitForURL(/\/admin\/products$/);
      await page.locator('[data-ready="true"]').waitFor({ state: "detached" });
      assert.equal(await Product.countDocuments({ p_name: new RegExp(stamp) }), 0);
      check(page);
    } finally {
      await s?.cleanup();
    }
  });

  await scenario("Product form: phone layout, sticky bar above the tab bar, 44px targets", async () => {
    try {
      s = await seedLookups(stamp);
      const page = await openPage({ mobile: true });
      await openAdmin(page, baseUrl, admin, "/products/new");
      await ready(page);
      assert.equal(await noSideScroll(page), true);
      const small = () => page.evaluate(() => [...document.querySelectorAll("main a, main button, main select, main input:not(.sr-only):not([aria-hidden]), [role=dialog] button, [role=dialog] input")]
        // A switch's hit area is its full-width 44px label row (checked separately below).
        .filter((el) => !(el.getAttribute("role") === "switch" && el.closest("label")?.getBoundingClientRect().height >= 44))
        .map((el) => [el, el.getBoundingClientRect()]).filter(([, r]) => r.width > 0 && r.height > 0 && r.height < 44)
        .map(([el]) => `${el.tagName} ${el.getAttribute("aria-label") || el.textContent.trim().slice(0, 20)}`));
      assert.deepEqual(await small(), []);
      // Sticky action bar: visible at the scroll top and pinned above the fixed tab bar.
      const submit = page.getByRole("button", { name: "إضافة المنتج" });
      const geo = async () => page.evaluate(() => ({ btn: document.querySelector('form button[type="submit"]').getBoundingClientRect().bottom, tab: document.querySelector('nav[aria-label="التنقل السريع"]').getBoundingClientRect().top }));
      let g = await geo();
      assert.ok(g.btn <= g.tab, "submit above the tab bar without scrolling");
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      g = await geo();
      assert.ok(g.btn <= g.tab + 0.5, "still above the tab bar at the bottom");
      await page.evaluate(() => window.scrollTo(0, 0));
      assert.ok((await submit.boundingBox()).height >= 44);
      await pickOil(page, `OIL-${stamp}`);
      await page.getByRole("button", { name: /تغيير الزيت/ }).click();
      const dlg = page.getByRole("dialog");
      await dlg.waitFor();
      await until(async () => (await dlg.getByRole("button", { name: "إغلاق" }).boundingBox()).height >= 44, "close >= 44px");
      assert.deepEqual(await small(), []);
      assert.equal(await noSideScroll(page), true);
      await dlg.getByRole("button", { name: "إغلاق" }).click();
      await dlg.waitFor({ state: "detached" });
      await page.locator("#p_name").fill(NAME);
      await assertPageIsXssSafe(page, [s.oilName]);
      assert.deepEqual(await small(), []);
      check(page);
    } finally {
      await s?.cleanup();
    }
  });

}
