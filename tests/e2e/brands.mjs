// Designers (brands) e2e scenario. Registered from run.mjs after the server is listening, before
// fx.mjs (which swaps the shared browser context) — see the brief in .superpowers/sdd/brands-report.md.
//
// registerBrandScenarios({ scenario, openPage, check, baseUrl, shotDir, admin, productId })
import assert from "node:assert/strict";
import path from "node:path";
import Product from "../../backend/models/product.model.js";
import { CATEGORIES } from "../../storefront/js/shared/vocab.js";

async function loginAdmin(openPage, baseUrl, admin) {
  const page = await openPage();
  await page.goto(`${baseUrl}/admin/html/login.html`);
  await page.fill("#username", admin.username);
  await page.fill("#password", admin.password);
  await Promise.all([page.waitForURL(/index\.html/), page.click("#loginForm button[type=submit]")]);
  return page;
}

export async function registerBrandScenarios({ scenario, openPage, check, baseUrl, shotDir, admin, productId }) {
  await scenario("Designers: create a brand, assign it, and find it on the store", async () => {
    // 1. Create "Dior" / "ديور" in brands.html.
    const admin1 = await loginAdmin(openPage, baseUrl, admin);
    await admin1.goto(`${baseUrl}/admin/html/brands.html`);
    await admin1.waitForSelector("#brandsBody");
    await admin1.click("#addBrandBtn");
    await admin1.fill("#bf-name-ar", "ديور");
    await admin1.fill("#bf-name-en", "Dior");
    await Promise.all([
      admin1.waitForResponse((r) => r.url().endsWith("/api/brands") && r.request().method() === "POST"),
      admin1.click("#brandSave"),
    ]);
    await admin1.locator("#brandsBody", { hasText: "ديور" }).waitFor();
    await admin1.screenshot({ path: path.join(shotDir, "brands-admin-1440.png"), fullPage: true });
    check(admin1);

    // 2. Assign it to a product in the edit form.
    await admin1.goto(`${baseUrl}/admin/html/edit_product.html?id=${productId}`);
    // <option> elements report as not-visible to Playwright's default waitForSelector (they only
    // render inside an open dropdown) — wait for the count in the DOM instead.
    await admin1.waitForFunction(() => document.querySelectorAll("#p_brand option").length > 1);
    await admin1.selectOption("#p_brand", { label: "ديور / Dior" });
    const put = admin1.waitForResponse((r) => r.url().endsWith(`/api/products/${productId}`) && r.request().method() === "PUT");
    await admin1.click("#editProductForm button[type=submit]");
    assert.equal((await put).status(), 200);
    check(admin1);

    // 3. /brand/dior lists it.
    const brandPage = await openPage({ mobile: true });
    await brandPage.setViewportSize({ width: 375, height: 812 });
    await brandPage.goto(`${baseUrl}/brand/dior`);
    await brandPage.waitForLoadState("networkidle");
    await brandPage.locator(".card-name").first().waitFor();
    const scrollWidth = await brandPage.evaluate(() => document.documentElement.scrollWidth);
    const clientWidth = await brandPage.evaluate(() => document.documentElement.clientWidth);
    assert.ok(scrollWidth <= clientWidth + 1, `horizontal scroll at 375px: ${scrollWidth} > ${clientWidth}`);
    await brandPage.screenshot({ path: path.join(shotDir, "brand-page-375.png"), fullPage: true });
    check(brandPage);

    // 4. Overlay search "ديور" shows it.
    const search = await openPage({ mobile: true });
    await search.setViewportSize({ width: 375, height: 812 });
    await search.goto(`${baseUrl}/`);
    await search.click("[data-open-search]");
    await search.fill("#so-q", "ديور");
    await search.locator("#so-results .so-item").first().waitFor();
    await search.screenshot({ path: path.join(shotDir, "search-brand-375.png"), fullPage: true });
    check(search);

    // 5. The collection designer chip filters instantly, with b=dior in the URL. The product's
    // category may have been changed by an earlier scenario reusing the same seeded product
    // (e.g. run.mjs's "Bulk tagging"), so read its current category rather than assuming Men.
    const current = await Product.findById(productId).lean();
    const slug = CATEGORIES.find((c) => c.key === current.p_category)?.slug ?? "men";
    const collection = await openPage();
    await collection.goto(`${baseUrl}/c/${slug}`);
    await collection.waitForLoadState("networkidle");
    const chip = collection.locator('.filter-chips input[name=b][value=dior] + .toggle-face');
    await chip.waitFor();
    await chip.click();
    await collection.waitForFunction(() => location.search.includes("b=dior"));
    assert.match(collection.url(), /b=dior/);
    check(collection);
  });
}
