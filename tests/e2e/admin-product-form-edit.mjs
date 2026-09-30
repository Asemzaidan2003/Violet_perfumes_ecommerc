// New React admin product form (edit). registerAdminProductFormEditScenarios({ scenario, openPage, check, baseUrl, admin })
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { assertPageIsXssSafe, openAdmin } from "./admin-helpers.mjs";
import { apiProduct, NET_NOISE, ready, seedLookups, until } from "./admin-product-form-shared.mjs";

const strip = ({ p_name, updatedAt, __v, size_list, ...rest }) => ({ ...rest, size_list: (size_list ?? []).map(({ size, price }) => ({ size, price })) });

export async function registerAdminProductFormEditScenarios({ scenario, openPage, check, baseUrl, admin }) {
  const stamp = crypto.randomUUID().slice(0, 8);
  let s;
  const rowFor = (page, name) => page.locator("tr", { hasText: name });

  await scenario("Product form: edit with only a new name keeps every other field, Back lands before the form", async () => {
    try {
      s = await seedLookups(stamp);
      const p = await s.product({
        p_name: `عطر كامل ${stamp}`, brand: s.brand._id, p_offer_percentage: 12.5, offer_ends_at: new Date("2031-01-02T03:04:05.678Z"),
        p_image: "https://img.example.test/a.png", images: ["https://img.example.test/1.png", "https://img.example.test/2.png"],
        families: ["oud", "musk"], notes: { top: ["برغموت"], heart: ["ورد", "ياسمين"], base: ["عود"] },
        description: "وصف طويل", keywords: "kw one", status: "out of stock", visible: false, oil_percentage: 0, alcohol_percentage: 100,
        size_list: [{ size: "30", price: 15.5 }, { size: "50", price: 0 }],
      });
      const page = await openPage();
      await page.setViewportSize({ width: 1440, height: 900 });
      await page.route("https://img.example.test/**", (rt) => rt.fulfill({ status: 200, contentType: "image/png", body: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==", "base64") }));
      await openAdmin(page, baseUrl, admin, "/products");
      await rowFor(page, p.p_name).waitFor();
      const before = await apiProduct(page, p._id);
      await rowFor(page, p.p_name).getByRole("link", { name: /تعديل/ }).click();
      await ready(page);
      assert.equal(await page.locator("#p_name").inputValue(), p.p_name);
      assert.equal(await page.locator("#p_offer_percentage").inputValue(), "12.5");
      assert.equal(await page.locator("#oil_percentage").inputValue(), "0");
      assert.equal(await page.locator("#alcohol_percentage").inputValue(), "100");
      assert.equal(await page.locator("#status").inputValue(), "out of stock");
      const d = new Date("2031-01-02T03:04:05.678Z"), z = (n) => String(n).padStart(2, "0");
      assert.equal(await page.locator("#offer_ends_at").inputValue(), `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}T${z(d.getHours())}:${z(d.getMinutes())}`);
      await page.getByTestId("selected-oil").getByText(s.oilName).waitFor();
      const puts = [];
      page.on("request", (r) => { if (r.method() === "PUT") puts.push(r.postDataJSON()); });
      const newName = `اسم معدّل ${stamp}`;
      await page.locator("#p_name").fill(newName);
      await page.getByRole("button", { name: "حفظ التعديلات" }).click();
      await page.getByText("تم تحديث المنتج").waitFor();
      await page.waitForURL(/\/admin\/products$/);
      assert.equal(await page.getByRole("alertdialog").count(), 0, "no leave prompt after saving");
      const after = await apiProduct(page, p._id);
      assert.equal(after.p_name, newName);
      assert.deepEqual(strip(after), strip(before), "only the name changed");
      assert.equal(puts.length, 1);
      assert.equal(puts[0].brand, String(s.brand._id), "PUT carries the brand");
      assert.deepEqual(puts[0].images, before.images);
      assert.deepEqual(puts[0].families, before.families);
      assert.equal(puts[0].offer_ends_at, before.offer_ends_at, "offer end instant unchanged (seconds kept)");
      // Back once lands on the page before the form (the list), not the form.
      await rowFor(page, newName).waitFor();
      await page.goBack();
      await page.waitForFunction(() => location.pathname === "/admin/products");
      await page.waitForTimeout(300);
      assert.match(new URL(page.url()).pathname, /^\/admin\/products$/);
      assert.equal(await page.locator("#p_name").count(), 0, "not the form");
      await rowFor(page, newName).waitFor();
      check(page);
    } finally {
      await s?.cleanup();
    }
  });

  await scenario("Product form: edit keeps an inactive brand and a missing brand, waits for lookups, decimals and oil change", async () => {
    try {
      s = await seedLookups(stamp);
      const inactive = await s.product({ p_name: `عطر مصمم متوقف ${stamp}`, brand: s.brandOff._id });
      const noBrand = await s.product({ p_name: `عطر بلا مصمم ${stamp}` });
      const page = await openPage();
      await page.setViewportSize({ width: 1440, height: 900 });
      // Slow brand list: the form must not render (nor populate) until it settles.
      await page.route(/\/api\/brands$/, async (rt) => { await new Promise((r) => setTimeout(r, 900)); await rt.continue(); });
      await openAdmin(page, baseUrl, admin, `/products/${inactive._id}/edit`);
      await page.locator('[data-ready="false"]').waitFor();
      assert.equal(await page.locator("#p_name").count(), 0, "no form before lookups settle");
      await ready(page);
      await page.unroute(/\/api\/brands$/);
      await page.locator("#p_name").fill(`عطر مصمم متوقف معدّل ${stamp}`);
      await page.getByRole("button", { name: "حفظ التعديلات" }).click();
      await page.waitForURL(/\/admin\/products$/);
      assert.equal(String((await apiProduct(page, inactive._id)).brand), String(s.brandOff._id), "inactive brand kept");

      // No brand stays no brand; decimal price with a comma; oil changed; offer end cleared.
      await page.goto(`${baseUrl}/admin/products/${noBrand._id}/edit`);
      await ready(page);
      await page.locator("#size-price-0").fill("12,5");
      await page.getByRole("button", { name: "تغيير الزيت" }).click();
      const dlg = page.getByRole("dialog");
      await dlg.getByLabel("بحث").fill(`ZED-${stamp}`);
      await dlg.getByRole("button", { name: `زيت ثانٍ ${stamp}` }).click();
      await page.locator("#p_offer_percentage").fill("٧٫٥");
      await page.getByRole("button", { name: "حفظ التعديلات" }).click();
      await page.waitForURL(/\/admin\/products$/);
      const saved = await apiProduct(page, noBrand._id);
      assert.equal(saved.brand ?? null, null);
      assert.equal(saved.size_list[0].price, 12.5);
      assert.equal(saved.oil_id, `ZED-${stamp}`);
      assert.equal(saved.p_offer_percentage, 7.5);
      assert.equal(saved.p_name, noBrand.p_name);
      assert.deepEqual(page.errors.filter((e) => !NET_NOISE.test(e)), []);
    } finally {
      await s?.cleanup();
    }
  });

  await scenario("Product form: unknown or malformed product id shows an error state", async () => {
    try {
      s = await seedLookups(stamp);
      const page = await openPage();
      await page.setViewportSize({ width: 1440, height: 900 });
      await openAdmin(page, baseUrl, admin, "/products/000000000000000000000000/edit");
      await page.getByRole("alert").getByText("المنتج غير موجود").waitFor();
      assert.equal(await page.locator("#p_name").count(), 0);
      await page.goto(`${baseUrl}/admin/products/not-an-id/edit`);
      await page.getByRole("alert").getByText("المنتج غير موجود").waitFor();
      assert.equal(await page.locator('[data-ready="true"]').count(), 0);
      // Server failure: retryable error state.
      const p = await s.product({ p_name: `عطر خطأ ${stamp}` });
      await page.route(new RegExp(`/api/products/${p._id}$`), (rt) => rt.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ success: false, message: "Server error" }) }));
      await page.goto(`${baseUrl}/admin/products/${p._id}/edit`);
      await page.getByRole("button", { name: "إعادة المحاولة" }).waitFor();
      await page.unroute(new RegExp(`/api/products/${p._id}$`));
      await page.getByRole("button", { name: "إعادة المحاولة" }).click();
      await ready(page);
      assert.equal(await page.locator("#p_name").inputValue(), p.p_name);
      assert.deepEqual(page.errors.filter((e) => !NET_NOISE.test(e) && !/status of 500/.test(e)), []);
    } finally {
      await s?.cleanup();
    }
  });

  await scenario("Product form: hostile product name renders literally on the edit form (phone)", async () => {
    try {
      s = await seedLookups(stamp);
      const hostile = `<img src=x onerror=window.__xss=5> ${stamp}`;
      const p = await s.product({ p_name: hostile, brand: s.brand._id, p_category: s.catHidden.key });
      const page = await openPage({ mobile: true });
      await openAdmin(page, baseUrl, admin, `/products/${p._id}/edit`);
      await ready(page);
      assert.equal(await page.locator("#p_name").inputValue(), hostile);
      assert.equal(await page.locator("#p_category").inputValue(), s.catHidden.key, "hidden category stays selected");
      await page.getByTestId("selected-oil").getByText(s.oilName).waitFor();
      await assertPageIsXssSafe(page, [s.oilName]);
      await until(async () => (await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)), "no sideways scroll");
      check(page);
    } finally {
      await s?.cleanup();
    }
  });
}
