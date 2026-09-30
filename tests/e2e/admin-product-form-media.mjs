// New React admin product form: media (primary image, gallery), families, designer and notes/description/
// keywords — Task 5. registerAdminProductFormMediaScenarios({ scenario, openPage, check, baseUrl, admin, pngPath })
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { assertPageIsXssSafe, noSideScroll, openAdmin } from "./admin-helpers.mjs";
import { apiProduct, NET_NOISE, ready, seedLookups, until } from "./admin-product-form-shared.mjs";

// Chip inputs are visually hidden; the label is the click target.
const toggleFamily = (page, ar) => page.getByRole("group", { name: "العائلات العطرية" }).locator("label", { hasText: ar }).click();

export async function registerAdminProductFormMediaScenarios({ scenario, openPage, check, baseUrl, admin, pngPath }) {
  const stamp = crypto.randomUUID().slice(0, 8);
  let s;

  async function pickOil(page, term) {
    await page.getByRole("button", { name: /اختيار زيت|تغيير الزيت/ }).click();
    const dlg = page.getByRole("dialog");
    await dlg.waitFor();
    await dlg.getByLabel("بحث").fill(term);
    await dlg.getByRole("button", { name: new RegExp(term) }).click();
    await dlg.waitFor({ state: "detached" });
  }
  async function fillBasics(page, { name }) {
    await page.locator("#p_name").fill(name);
    await page.locator("#p_category").selectOption(s.cat.key);
    await pickOil(page, `OIL-${stamp}`);
    await page.locator("#oil_percentage").fill("0");
    await page.locator("#alcohol_percentage").fill("0");
    await page.locator("#size-0").fill("30");
    await page.locator("#size-price-0").fill("10");
  }
  const galleryUrls = (page) => page.evaluate(() => [...document.querySelectorAll('li img[alt^="صورة إضافية"]')].map((i) => i.getAttribute("src")));

  await scenario("Product media: add with an uploaded photo, gallery, families, designer and notes", async () => {
    try {
      s = await seedLookups(stamp);
      const page = await openPage();
      await page.setViewportSize({ width: 1440, height: 900 });
      const posts = [];
      page.on("request", (r) => { if (r.url().startsWith("blob:")) posts.push({ blob: r.url() }); if (r.method() === "POST" && r.url().endsWith("/api/products")) posts.push(r.postDataJSON()); });
      await openAdmin(page, baseUrl, admin, "/products/new");
      await ready(page);

      await page.setInputFiles("#p_image_file", pngPath);
      await page.waitForFunction(() => /^\/img\//.test(document.getElementById("p_image").value));
      const primaryUrl = await page.locator("#p_image").inputValue();

      await fillBasics(page, { name: `منتج وسائط ${stamp}` });
      await toggleFamily(page, "عود");
      await toggleFamily(page, "عنبر");
      const noteText = "عود، مسك،عنبر";
      await page.locator("#notes_base").fill(noteText);
      await page.locator("#notes_base").blur();

      // Gallery: two uploads (each gets a distinct server id/url even for identical bytes).
      await page.setInputFiles("#gallery_file", [pngPath, pngPath]);
      await until(async () => (await galleryUrls(page)).length === 2, "two gallery thumbnails");
      const [first, second] = await galleryUrls(page);
      assert.notEqual(first, second, "two distinct uploads");

      // Reorder: move the first image down, order flips.
      await page.getByRole("button", { name: "تحريك الصورة 1 للأسفل" }).click();
      assert.deepEqual(await galleryUrls(page), [second, first]);
      // Make the (now first) image primary.
      await page.getByRole("button", { name: "جعل الصورة 1 الرئيسية" }).click();
      assert.equal(await page.locator("#p_image").inputValue(), second);
      // Remove the second gallery image; one remains.
      await page.getByRole("button", { name: "إزالة الصورة 2" }).click();
      await until(async () => (await galleryUrls(page)).length === 1, "one gallery image left");

      // Designer (hostile name_ar renders literally) + hostile description.
      await page.locator("#p_brand").selectOption(String(s.brand._id));
      assert.equal(await page.locator("#p_brand option:checked").textContent(), `${s.brand.name_ar} / ${s.brand.name_en}`);
      const hostileDesc = `<svg onload=window.__xss=9> وصف ${stamp}`;
      await page.locator("#description").fill(hostileDesc);
      await page.locator("#keywords").fill("kw one, kw two");
      assert.equal(await page.locator("#description").inputValue(), hostileDesc);
      await assertPageIsXssSafe(page, [s.brand.name_ar]);

      await page.getByRole("button", { name: "إضافة المنتج" }).click();
      await page.getByText("تمت إضافة المنتج").waitFor();
      await page.waitForURL(/\/admin\/products$/);

      const bodies = posts.filter((p) => !p.blob);
      assert.equal(bodies.length, 1, "one POST");
      const body = bodies[0];
      assert.equal(body.p_image, second, "primary image is the one made primary");
      assert.deepEqual(body.images, [second], "gallery order/content after reorder+remove");
      assert.deepEqual(body.families, ["oud", "amber"], "families in vocab/DOM order");
      assert.deepEqual(body.notes.base, ["عود", "مسك", "عنبر"]);
      assert.equal(body.description, hostileDesc);
      assert.equal(body.keywords, "kw one, kw two");
      assert.equal(body.brand, String(s.brand._id));
      assert.equal(posts.filter((p) => p.blob).length, 0, "no blob: request");

      const imgStatus = await page.evaluate(async (url) => (await fetch(url)).status, second);
      assert.equal(imgStatus, 200, "primary image fetchable");
      check(page);
    } finally {
      await s?.cleanup();
    }
  });

  await scenario("Product media: edit unchecks a family and keeps images, notes, description, designer", async () => {
    try {
      s = await seedLookups(stamp);
      const p = await s.product({
        p_name: `منتج وسائط معدّل ${stamp}`, brand: s.brandOff._id, families: ["oud", "amber"],
        notes: { top: [], heart: [], base: ["عود"] }, description: "وصف قديم", keywords: "kw old",
        images: ["https://img.example.test/1.png", "https://img.example.test/2.png"],
      });
      const page = await openPage();
      await page.setViewportSize({ width: 1440, height: 900 });
      await page.route("https://img.example.test/**", (rt) => rt.fulfill({ status: 200, contentType: "image/png", body: Buffer.from(pngBase64(), "base64") }));
      await openAdmin(page, baseUrl, admin, `/products/${p._id}/edit`);
      await ready(page);

      // Inactive brand stays selected; "بدون" is still offered.
      assert.equal(await page.locator("#p_brand").inputValue(), String(s.brandOff._id));
      assert.equal(await page.locator('#p_brand option[value=""]').textContent(), "بدون");
      assert.equal(await page.getByRole("checkbox", { name: "عود" }).isChecked(), true);
      assert.equal(await page.getByRole("checkbox", { name: "عنبر" }).isChecked(), true);
      assert.equal((await galleryUrls(page)).length, 2, "gallery round-trips");
      assert.equal(await page.locator("#notes_base").inputValue(), "عود");
      assert.equal(await page.locator("#description").inputValue(), "وصف قديم");

      const puts = [];
      page.on("request", (r) => { if (r.method() === "PUT") puts.push(r.postDataJSON()); });
      await toggleFamily(page, "عنبر");
      await page.getByRole("button", { name: "حفظ التعديلات" }).click();
      await page.getByText("تم تحديث المنتج").waitFor();
      await page.waitForURL(/\/admin\/products$/);
      assert.equal(puts.length, 1);
      assert.deepEqual(puts[0].families, ["oud"]);
      assert.deepEqual(puts[0].notes.base, ["عود"], "notes untouched");
      assert.equal(puts[0].description, "وصف قديم");
      assert.equal(puts[0].brand, String(s.brandOff._id), "inactive brand kept");
      const saved = await apiProduct(page, p._id);
      assert.deepEqual(saved.families, ["oud"]);
      assert.deepEqual(saved.images, p.images);
      assert.deepEqual(page.errors.filter((e) => !NET_NOISE.test(e)), []);
    } finally {
      await s?.cleanup();
    }
  });

  await scenario("Product media: rejects an oversized file and an SVG, no upload request", async () => {
    const bigPath = path.join(os.tmpdir(), `nsamat-e2e-big-${process.pid}.png`);
    const svgPath = path.join(os.tmpdir(), `nsamat-e2e-bad-${process.pid}.svg`);
    try {
      s = await seedLookups(stamp);
      await fs.writeFile(bigPath, Buffer.alloc(4 * 1024 * 1024, 1));
      await fs.writeFile(svgPath, "<svg onload=window.__xss=7></svg>");
      const page = await openPage();
      await page.setViewportSize({ width: 1440, height: 900 });
      let uploads = 0;
      page.on("request", (r) => { if (r.url().includes("/api/uploads")) uploads += 1; });
      await openAdmin(page, baseUrl, admin, "/products/new");
      await ready(page);

      await page.setInputFiles("#p_image_file", bigPath);
      await page.getByText("حجم الصورة يتجاوز 3 ميغابايت").waitFor();
      assert.equal(uploads, 0);
      await page.setInputFiles("#p_image_file", svgPath);
      await page.getByText(/نوع الملف غير مدعوم/).waitFor();
      assert.equal(uploads, 0);

      await page.setInputFiles("#gallery_file", bigPath);
      await page.getByText(/حجم الصورة يتجاوز 3 ميغابايت/).first().waitFor();
      assert.equal(uploads, 0);
      assert.equal((await galleryUrls(page)).length, 0, "nothing added to the gallery");
      check(page);
    } finally {
      await s?.cleanup();
      await fs.rm(bigPath, { force: true }).catch(() => {});
      await fs.rm(svgPath, { force: true }).catch(() => {});
    }
  });

  await scenario("Product media: a failing gallery upload still leaves a usable product with a toast", async () => {
    try {
      s = await seedLookups(stamp);
      const page = await openPage();
      await page.setViewportSize({ width: 1440, height: 900 });
      await openAdmin(page, baseUrl, admin, "/products/new");
      await ready(page);
      await fillBasics(page, { name: `منتج رفع فاشل ${stamp}` });

      // The second file's thumbnail upload fails; its full image is still uploaded but the item
      // never reaches the gallery (uploadImage rejects) — only the first file should land.
      let thumbCalls = 0;
      await page.route(/\/api\/uploads\/[a-f0-9]+\/thumb$/, (rt) => {
        thumbCalls += 1;
        if (thumbCalls === 2) return rt.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ success: false, message: "فشل رفع الصورة" }) });
        return rt.continue();
      });
      await page.setInputFiles("#gallery_file", [pngPath, pngPath]);
      await page.getByText(/فشل رفع الصورة/).waitFor();
      await until(async () => (await galleryUrls(page)).length === 1, "only the successful upload landed");

      await page.getByRole("button", { name: "إضافة المنتج" }).click();
      await page.getByText("تمت إضافة المنتج").waitFor();
      await page.waitForURL(/\/admin\/products$/);
      const expected = page.errors.filter((e) => /\/api\/uploads\/[a-f0-9]+\/thumb/.test(e));
      assert.equal(expected.length, 1, "the injected thumb 500 is the only console noise");
      page.errors.splice(0, page.errors.length, ...page.errors.filter((e) => !expected.includes(e)));
      check(page);
    } finally {
      await s?.cleanup();
    }
  });

  await scenario("Product media: note validation (too many items, an item too long)", async () => {
    try {
      s = await seedLookups(stamp);
      const page = await openPage();
      await page.setViewportSize({ width: 1440, height: 900 });
      let posts = 0;
      page.on("request", (r) => { if (r.method() === "POST" && r.url().endsWith("/api/products")) posts += 1; });
      await openAdmin(page, baseUrl, admin, "/products/new");
      await ready(page);
      await fillBasics(page, { name: `منتج نوتات ${stamp}` });

      const eleven = Array.from({ length: 11 }, (_, i) => `عنصر${i}`).join(",");
      await page.locator("#notes_top").fill(eleven);
      await page.locator("#notes_top").blur();
      await page.getByRole("button", { name: "إضافة المنتج" }).click();
      await page.getByText("النوتات العليا: 10 عناصر كحد أقصى").waitFor();
      assert.equal(posts, 0);

      await page.locator("#notes_top").fill("عنصر واحد");
      await page.locator("#notes_top").blur();
      await page.locator("#notes_heart").fill("a".repeat(41));
      await page.locator("#notes_heart").blur();
      await page.getByRole("button", { name: "إضافة المنتج" }).click();
      await page.getByText("نوتات القلب: كل عنصر بحد أقصى 40 حرفًا").waitFor();
      assert.equal(posts, 0);

      await page.locator("#notes_heart").fill("");
      await page.locator("#notes_heart").blur();
      await page.getByRole("button", { name: "إضافة المنتج" }).click();
      await page.getByText("تمت إضافة المنتج").waitFor();
      await page.waitForURL(/\/admin\/products$/);
      check(page);
    } finally {
      await s?.cleanup();
    }
  });

  await scenario("Product media: phone layout, chips and gallery controls stay >=44px", async () => {
    try {
      s = await seedLookups(stamp);
      const page = await openPage({ mobile: true });
      await openAdmin(page, baseUrl, admin, "/products/new");
      await ready(page);
      assert.equal(await noSideScroll(page), true);
      const chipBox = await page.getByRole("checkbox", { name: "عود" }).locator("..").boundingBox();
      assert.ok(chipBox.height >= 44, "family chip >= 44px");
      await page.setInputFiles("#gallery_file", pngPath);
      await until(async () => (await galleryUrls(page)).length === 1, "gallery image uploaded");
      for (const name of ["تحريك الصورة 1 للأعلى", "تحريك الصورة 1 للأسفل", "جعل الصورة 1 الرئيسية", "إزالة الصورة 1"]) {
        const box = await page.getByRole("button", { name }).boundingBox();
        assert.ok(box && box.height >= 44, `${name} >= 44px`);
      }
      assert.equal(await noSideScroll(page), true);
      check(page);
    } finally {
      await s?.cleanup();
    }
  });
}

function pngBase64() {
  return "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";
}
