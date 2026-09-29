// Stage D e2e: home page, footer, contact, social, texts, delivery areas admin editor.
// registerStorefrontCmsScenarios({ scenario, openPage, check, baseUrl, shotDir, admin })
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

export async function registerStorefrontCmsScenarios({ scenario, openPage, check, baseUrl, shotDir, admin }) {
  await scenario("Storefront CMS: hero title, section order/visibility, contact and delivery areas", async () => {
    const a = await loginAdmin(openPage, baseUrl, admin);
    await a.goto(`${baseUrl}/admin/html/storefront.html`);
    await a.waitForSelector("#sfSave:not([disabled])");

    // 1. Change the hero title.
    await a.fill("#hero_title", "متجرنا الجديد — عطرك يحكي عنك");

    // 2. Hide "الأكثر مبيعًا" and move "العروض" to the top of the section list.
    const rows = a.locator("#sectionsBody tr");
    const bestSellersRow = rows.filter({ hasText: "الأكثر مبيعًا" });
    await bestSellersRow.locator('input[type=checkbox]').uncheck();

    const offersRow = rows.filter({ hasText: "العروض" });
    // "العروض" sits after "الأقسام" in the default order — click its up-arrow repeatedly.
    for (let i = 0; i < 7; i++) {
      const stillDisabled = await offersRow.locator("button", { hasText: "▲" }).isDisabled();
      if (stillDisabled) break;
      await offersRow.locator("button", { hasText: "▲" }).click();
    }

    // 3. Phone and Instagram link (in the collapsed "التذييل والتواصل" <details>).
    await a.locator("#contact_phone").locator("xpath=ancestor::details").evaluate((d) => { d.open = true; });
    await a.fill("#contact_phone", "0791234567");
    await a.fill("#social_instagram", "https://instagram.com/nsamat_e2e");

    // 4. Disable one governorate (in the collapsed "التوصيل" <details>).
    await a.locator("#governoratesBody").locator("xpath=ancestor::details").evaluate((d) => { d.open = true; });
    await a.locator('#governoratesBody input[value="العقبة"]').uncheck();

    await Promise.all([
      a.waitForResponse((r) => r.url().endsWith("/api/settings") && r.request().method() === "PUT"),
      a.click("#sfSave"),
    ]);
    await a.locator("#sfSuccess:not([hidden])").waitFor();
    await a.screenshot({ path: path.join(shotDir, "cms-d-admin-1440.png"), fullPage: true });
    check(a);

    // 5. Verify on the storefront.
    const home = await openPage();
    await home.goto(`${baseUrl}/`);
    await home.locator("#hero-title").waitFor();
    assert.match(await home.locator("#hero-title").textContent(), /متجرنا الجديد/);
    assert.equal(await home.locator('a[href="/best-sellers"]').count(), 0, "hidden section link is gone");
    assert.ok(await home.locator('a[href="tel:0791234567"]').first().isVisible());
    assert.ok(await home.locator('a[href="https://instagram.com/nsamat_e2e"]').first().isVisible());
    check(home);

    // 6. Checkout's city select no longer offers the disabled governorate.
    const checkout = await openPage();
    await checkout.goto(`${baseUrl}/checkout`);
    const cityOptions = await checkout.locator("#co-city option").allTextContents();
    assert.ok(!cityOptions.includes("العقبة"), "disabled governorate is not offered at checkout");
    check(checkout);

    // 7. No horizontal scroll at 375px, no console/CSP errors.
    const mobile = await openPage({ mobile: true });
    await mobile.goto(`${baseUrl}/`);
    await mobile.waitForLoadState("networkidle");
    const overflow = await mobile.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    assert.ok(overflow <= 1, `home overflows horizontally at 375px by ${overflow}px`);
    check(mobile);
  });
}
