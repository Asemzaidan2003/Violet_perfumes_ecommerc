// Designers (brands) e2e scenario. Registered from run.mjs after the server is listening, before
// fx.mjs (which swaps the shared browser context).
//
// registerBrandScenarios({ scenario, openPage, check, baseUrl, shotDir, admin, productId })
import assert from "node:assert/strict";
import path from "node:path";
import { apiCall, apiLogin } from "./admin-helpers.mjs";
import Product from "../../backend/models/product.model.js";
import { CATEGORIES } from "../../storefront/js/shared/vocab.js";

export async function registerBrandScenarios({ scenario, openPage, check, baseUrl, shotDir, admin, productId }) {
  await scenario("Designers: create a brand, assign it, and find it on the store", async () => {
    // 1-2. Create "Dior" / "ديور" and assign it to the seeded product through the API (the admin UI has its own scenarios).
    const admin1 = await openPage();
    await apiLogin(admin1, baseUrl, admin);
    const made = await apiCall(admin1, baseUrl, "POST", "/brands", { name_ar: "ديور", name_en: "Dior" });
    assert.equal(made.status, 201);
    const assigned = await apiCall(admin1, baseUrl, "PUT", `/products/${productId}`, { brand: made.body.data._id });
    assert.equal(assigned.status, 200);

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
