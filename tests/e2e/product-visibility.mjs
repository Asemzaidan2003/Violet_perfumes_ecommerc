// Store-visibility toggle (admin all_products.html) — kept in its own module so run.mjs
// stays small; registered with a single call from run.mjs after the server is listening.
import assert from "node:assert/strict";
import Product from "../../backend/models/product.model.js";
import { invalidateCatalog } from "../../backend/store/catalog.js";

export async function registerProductVisibilityScenarios({ scenario, openPage, check, baseUrl }) {
  await scenario("Toggling a product hidden removes it from the store", async () => {
    const product = await Product.create({
      p_name: "عطر قابل للإخفاء", p_image: ".", p_category: "Men",
      oil_id: "OIL1", oil_percentage: 20, alcohol_percentage: 80,
      size_list: [{ size: "30", price: 15 }],
    });
    invalidateCatalog();

    const page = await openPage();
    await page.goto(`${baseUrl}/admin/html/all_products.html`);
    await page.waitForSelector("#productTable tbody tr:not(.loading-row)");

    const row = page.locator("#productTable tbody tr", { hasText: "عطر قابل للإخفاء" });
    await row.waitFor();
    const toggle = row.locator('input[type=checkbox]');
    assert.equal(await toggle.isChecked(), true, "starts visible");

    const put = page.waitForResponse((r) => r.url().endsWith(`/api/products/${product._id}`) && r.request().method() === "PUT");
    await row.locator(".switch-track").click(); // visible sibling of the hidden checkbox; the <label> forwards the click
    assert.equal((await put).status(), 200);
    await row.locator("text=مخفي").waitFor();
    check(page);

    const home = await openPage();
    await home.goto(`${baseUrl}/`);
    await home.waitForLoadState("networkidle");
    assert.equal(await home.locator(".card-name", { hasText: "عطر قابل للإخفاء" }).count(), 0, "still visible on the store");
    await home.reload();
    await home.waitForLoadState("networkidle");
    assert.equal(await home.locator(".card-name", { hasText: "عطر قابل للإخفاء" }).count(), 0, "reappeared after reload");
    check(home);
  });
}
