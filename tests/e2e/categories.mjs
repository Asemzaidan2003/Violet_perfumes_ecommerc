// Admin-managed categories (الأقسام) e2e scenario.
// registerCategoryScenarios({ scenario, openPage, check, baseUrl, shotDir, admin, productId })
import assert from "node:assert/strict";
import path from "node:path";

async function loginAdmin(openPage, baseUrl, admin) {
  const page = await openPage();
  await page.goto(`${baseUrl}/admin/html/login.html`);
  await page.fill("#username", admin.username);
  await page.fill("#password", admin.password);
  await Promise.all([page.waitForURL(/index\.html/), page.click("#loginForm button[type=submit]")]);
  return page;
}

export async function registerCategoryScenarios({ scenario, openPage, check, baseUrl, shotDir, admin, productId }) {
  await scenario("Categories: create a category, assign it, find it on the store, then hide it", async () => {
    // 1. Create "عطور العود" / oud-perfumes in categories.html.
    const admin1 = await loginAdmin(openPage, baseUrl, admin);
    await admin1.goto(`${baseUrl}/admin/html/categories.html`);
    await admin1.waitForSelector("#categoriesBody");
    await admin1.click("#addCategoryBtn");
    await admin1.fill("#cf-key", "Oud");
    await admin1.fill("#cf-slug", "oud-perfumes");
    await admin1.fill("#cf-name-ar", "عطور العود");
    await Promise.all([
      admin1.waitForResponse((r) => r.url().endsWith("/api/categories") && r.request().method() === "POST"),
      admin1.click("#categorySave"),
    ]);
    await admin1.locator("#categoriesBody", { hasText: "عطور العود" }).waitFor();
    await admin1.screenshot({ path: path.join(shotDir, "cms-c-admin-1440.png"), fullPage: true });
    check(admin1);

    // 2. Assign it to a product in the edit form.
    await admin1.goto(`${baseUrl}/admin/html/edit_product.html?id=${productId}`);
    // <option> elements report as not-visible to Playwright's default waitForSelector (they only
    // render inside an open dropdown) — wait for the count in the DOM instead.
    await admin1.waitForFunction(() => document.querySelectorAll("#p_category option").length > 1);
    await admin1.selectOption("#p_category", { label: "عطور العود" });
    const put = admin1.waitForResponse((r) => r.url().endsWith(`/api/products/${productId}`) && r.request().method() === "PUT");
    await admin1.click("#editProductForm button[type=submit]");
    assert.equal((await put).status(), 200);
    check(admin1);

    // 3. The storefront nav and /c/oud-perfumes both show it.
    const home = await openPage();
    await home.goto(`${baseUrl}/`);
    await home.locator('a[href="/c/oud-perfumes"]').first().waitFor();
    check(home);

    const aisle = await openPage();
    await aisle.goto(`${baseUrl}/c/oud-perfumes`);
    await aisle.waitForLoadState("networkidle");
    await aisle.locator(".card-name").first().waitFor();
    check(aisle);

    // 4. Hide it: gone from the nav.
    await admin1.goto(`${baseUrl}/admin/html/categories.html`);
    await admin1.waitForSelector("#categoriesBody");
    const toggle = admin1.locator("#categoriesBody tr", { hasText: "عطور العود" }).locator("input[type=checkbox]");
    await Promise.all([
      admin1.waitForResponse((r) => /\/api\/categories\/[a-f0-9]+$/.test(r.url()) && r.request().method() === "PUT"),
      toggle.click(),
    ]);
    check(admin1);

    const homeAfterHide = await openPage();
    await homeAfterHide.goto(`${baseUrl}/`);
    await homeAfterHide.waitForLoadState("networkidle");
    assert.equal(await homeAfterHide.locator('a[href="/c/oud-perfumes"]').count(), 0, "hidden category is gone from the nav");
    check(homeAfterHide);
  });
}
