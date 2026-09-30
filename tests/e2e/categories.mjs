// Admin-managed categories (الأقسام) e2e scenario.
// registerCategoryScenarios({ scenario, openPage, check, baseUrl, shotDir, admin, productId })
import assert from "node:assert/strict";
import { apiCall, apiLogin } from "./admin-helpers.mjs";

export async function registerCategoryScenarios({ scenario, openPage, check, baseUrl, shotDir, admin, productId }) {
  await scenario("Categories: create a category, assign it, find it on the store, then hide it", async () => {
    // 1-2. Create the category and assign it to the seeded product through the API (the admin UI has its own scenarios).
    const admin1 = await openPage();
    await apiLogin(admin1, baseUrl, admin);
    const made = await apiCall(admin1, baseUrl, "POST", "/categories", { key: "Oud", slug: "oud-perfumes", name_ar: "عطور العود" });
    assert.equal(made.status, 201);
    const assigned = await apiCall(admin1, baseUrl, "PUT", `/products/${productId}`, { p_category: "Oud" });
    assert.equal(assigned.status, 200);

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
    const hidden = await apiCall(admin1, baseUrl, "PUT", `/categories/${made.body.data._id}`, { visible: false });
    assert.equal(hidden.status, 200);

    const homeAfterHide = await openPage();
    await homeAfterHide.goto(`${baseUrl}/`);
    await homeAfterHide.waitForLoadState("networkidle");
    assert.equal(await homeAfterHide.locator('a[href="/c/oud-perfumes"]').count(), 0, "hidden category is gone from the nav");
    check(homeAfterHide);
  });
}
