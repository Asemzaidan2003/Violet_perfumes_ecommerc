// Store identity + advanced colour overrides e2e scenario. Registered from run.mjs after the
// server is listening, before fx.mjs (which swaps the shared browser context).
//
// registerIdentityScenarios({ scenario, openPage, check, baseUrl, admin, pngPath })
import path from "node:path";

async function loginAdmin(openPage, baseUrl, admin) {
  const page = await openPage();
  await page.goto(`${baseUrl}/admin/html/login.html`);
  await page.fill("#username", admin.username);
  await page.fill("#password", admin.password);
  await Promise.all([page.waitForURL(/index\.html/), page.click("#loginForm button[type=submit]")]);
  return page;
}

export async function registerIdentityScenarios({ scenario, openPage, check, baseUrl, admin, pngPath, shotDir }) {
  await scenario("Store identity: setting the name and a logo shows on the storefront", async () => {
    const admin1 = await loginAdmin(openPage, baseUrl, admin);
    await admin1.goto(`${baseUrl}/admin/html/settings.html`);
    await admin1.waitForSelector("#saveBtn:not([disabled])");

    await admin1.fill("#store_name", "متجر الاختبار");
    await admin1.setInputFiles("#logo_light_file", pngPath);
    await admin1.waitForFunction(() => document.getElementById("logo_light").value.startsWith("/img/"));

    await Promise.all([
      admin1.waitForResponse((r) => r.url().endsWith("/api/settings") && r.request().method() === "PUT"),
      admin1.click("#saveBtn"),
    ]);
    check(admin1);

    const store = await openPage();
    await store.goto(`${baseUrl}/`);
    if (!(await store.title()).includes("متجر الاختبار")) throw new Error(`title missing store name: ${await store.title()}`);
    const logoSrc = await store.getAttribute(".site-header .brand-mark", "src");
    if (!/^\/img\//.test(logoSrc)) throw new Error(`header logo not shown: ${logoSrc}`);
    check(store);

    if (shotDir) await store.screenshot({ path: path.join(shotDir, "cms-a-home-375.png") });

    // Reset for later scenarios/screenshots.
    await admin1.goto(`${baseUrl}/admin/html/settings.html`);
    await admin1.waitForSelector("#saveBtn:not([disabled])");
    await admin1.fill("#store_name", "نسمات");
    await admin1.evaluate(() => document.getElementById("logo_light_remove").click());
    await Promise.all([
      admin1.waitForResponse((r) => r.url().endsWith("/api/settings") && r.request().method() === "PUT"),
      admin1.click("#saveBtn"),
    ]);
    check(admin1);
  });

  await scenario("Advanced colours: a header background override matches the computed style", async () => {
    const admin1 = await loginAdmin(openPage, baseUrl, admin);
    await admin1.goto(`${baseUrl}/admin/html/settings.html`);
    await admin1.waitForSelector("#saveBtn:not([disabled])");
    await admin1.click("#advancedColors summary");
    await admin1.fill("#ov_bg-glass", "#336699");
    await Promise.all([
      admin1.waitForResponse((r) => r.url().endsWith("/api/settings") && r.request().method() === "PUT"),
      admin1.click("#saveBtn"),
    ]);
    check(admin1);

    const store = await openPage();
    await store.goto(`${baseUrl}/`);
    const bg = await store.evaluate(() => getComputedStyle(document.querySelector(".site-header")).backgroundColor);
    if (bg !== "rgb(51, 102, 153)") throw new Error(`header background not overridden: ${bg}`);
    check(store);

    if (shotDir) await admin1.screenshot({ path: path.join(shotDir, "cms-a-settings-1440.png"), fullPage: true });

    // Reset the override.
    await admin1.goto(`${baseUrl}/admin/html/settings.html`);
    await admin1.waitForSelector("#saveBtn:not([disabled])");
    await admin1.click("#advancedColors summary");
    await admin1.evaluate(() => document.querySelector('a[data-reset="bg-glass"]').click());
    await Promise.all([
      admin1.waitForResponse((r) => r.url().endsWith("/api/settings") && r.request().method() === "PUT"),
      admin1.click("#saveBtn"),
    ]);
    check(admin1);
  });
}
