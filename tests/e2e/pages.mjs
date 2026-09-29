// Content pages (terms, privacy, about, ...) e2e scenario. registerPageScenarios({ scenario,
// openPage, check, baseUrl, shotDir, admin })
import path from "node:path";

async function loginAdmin(openPage, baseUrl, admin) {
  const page = await openPage();
  await page.goto(`${baseUrl}/admin/html/login.html`);
  await page.fill("#username", admin.username);
  await page.fill("#password", admin.password);
  await Promise.all([page.waitForURL(/index\.html/), page.click("#loginForm button[type=submit]")]);
  return page;
}

export async function registerPageScenarios({ scenario, openPage, check, baseUrl, shotDir, admin }) {
  await scenario("Content pages: create, publish, footer link and rendered page", async () => {
    // 1. Create and publish a page with a heading and a bullet list, in pages.html.
    const admin1 = await loginAdmin(openPage, baseUrl, admin);
    await admin1.goto(`${baseUrl}/admin/html/pages.html`);
    await admin1.waitForSelector("#pagesBody");
    await admin1.click("#addPageBtn");
    await admin1.fill("#pf-title", "سياسة الشحن");
    await admin1.fill("#pf-slug", "e2e-shipping");
    await admin1.fill("#pf-body", "# سياسة الشحن\n\n- نوصل لكل الأردن\n- الدفع عند الاستلام");
    await admin1.locator("#pf-preview h1").waitFor();
    await Promise.all([
      admin1.waitForResponse((r) => r.url().endsWith("/api/pages") && r.request().method() === "POST"),
      admin1.click("#pageSave"),
    ]);
    await admin1.locator("#pagesBody", { hasText: "سياسة الشحن" }).waitFor();
    await admin1.screenshot({ path: path.join(shotDir, "cms-b-admin-1440.png"), fullPage: true });
    check(admin1);

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
