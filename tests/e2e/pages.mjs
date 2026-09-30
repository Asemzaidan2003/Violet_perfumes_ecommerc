// Content pages (terms, privacy, about, ...) e2e scenario. registerPageScenarios({ scenario,
// openPage, check, baseUrl, shotDir, admin })
import assert from "node:assert/strict";
import path from "node:path";
import { apiCall, apiLogin } from "./admin-helpers.mjs";

export async function registerPageScenarios({ scenario, openPage, check, baseUrl, shotDir, admin }) {
  await scenario("Content pages: create, publish, footer link and rendered page", async () => {
    // 1. Create and publish a page with a heading and a bullet list through the API (the admin UI has its own scenarios).
    const admin1 = await openPage();
    await apiLogin(admin1, baseUrl, admin);
    const made = await apiCall(admin1, baseUrl, "POST", "/pages", { title: "سياسة الشحن", slug: "e2e-shipping", body: "# سياسة الشحن\n\n- نوصل لكل الأردن\n- الدفع عند الاستلام", published: true });
    assert.equal(made.status, 201);

    // 2. The footer on the storefront home links to it.
    const home = await openPage();
    await home.goto(`${baseUrl}/`);
    await home.locator('footer a[href="/page/e2e-shipping"]').waitFor();
    check(home);

    // 3. The page itself renders with a real heading and list, no horizontal scroll at 375, no
    // console/CSP errors.
    const mobile = await openPage({ mobile: true });
    await mobile.setViewportSize({ width: 375, height: 812 });
    await mobile.goto(`${baseUrl}/page/e2e-shipping`);
    await mobile.locator("#page-title", { hasText: "سياسة الشحن" }).waitFor();
    await mobile.locator(".page-content ul li").first().waitFor();
    const scrollWidth = await mobile.evaluate(() => document.documentElement.scrollWidth);
    const clientWidth = await mobile.evaluate(() => document.documentElement.clientWidth);
    if (scrollWidth > clientWidth + 1) throw new Error(`horizontal scroll at 375px: ${scrollWidth} > ${clientWidth}`);
    await mobile.screenshot({ path: path.join(shotDir, "cms-b-page-375.png"), fullPage: true });
    check(mobile);
  });
}
