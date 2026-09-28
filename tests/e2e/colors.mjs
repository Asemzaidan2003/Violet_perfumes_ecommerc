// Configurable store colours e2e scenario. Registered from run.mjs after the server is
// listening: change the accent in settings.html, save, confirm the storefront's computed
// --gold changed after a reload, then reset and confirm it reverted.
//
// registerColorScenarios({ scenario, openPage, check, baseUrl, admin })

async function loginAdmin(openPage, baseUrl, admin) {
  const page = await openPage();
  await page.goto(`${baseUrl}/admin/html/login.html`);
  await page.fill("#username", admin.username);
  await page.fill("#password", admin.password);
  await Promise.all([page.waitForURL(/index\.html/), page.click("#loginForm button[type=submit]")]);
  return page;
}

const computedGold = (page) => page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--gold").trim());

export async function registerColorScenarios({ scenario, openPage, check, baseUrl, admin }) {
  await scenario("Store colours: changing the accent updates the storefront, reset restores it", async () => {
    const store = await openPage();
    await store.goto(`${baseUrl}/`);
    const original = await computedGold(store);

    const admin1 = await loginAdmin(openPage, baseUrl, admin);
    await admin1.goto(`${baseUrl}/admin/html/settings.html`);
    await admin1.waitForSelector("#saveBtn:not([disabled])");
    await admin1.fill("#theme_accent", "#3366CC");
    await Promise.all([
      admin1.waitForResponse((r) => r.url().endsWith("/api/settings") && r.request().method() === "PUT"),
      admin1.click("#saveBtn"),
    ]);
    check(admin1);

    await store.reload();
    const updated = await computedGold(store);
    if (updated.toLowerCase() === original.toLowerCase()) throw new Error(`--gold did not change: ${updated}`);
    if (updated.toLowerCase() !== "#3366cc") throw new Error(`expected --gold #3366cc, got ${updated}`);
    check(store);

    await admin1.goto(`${baseUrl}/admin/html/settings.html`);
    await admin1.waitForSelector("#saveBtn:not([disabled])");
    await Promise.all([
      admin1.waitForResponse((r) => r.url().endsWith("/api/settings") && r.request().method() === "PUT"),
      admin1.click("#resetThemeBtn"),
    ]);
    check(admin1);

    await store.reload();
    const restored = await computedGold(store);
    if (restored.toLowerCase() !== original.toLowerCase()) throw new Error(`--gold not restored: ${restored} !== ${original}`);
    check(store);
  });
}
