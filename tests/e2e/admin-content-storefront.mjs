// New React admin storefront CMS. registerAdminContentStorefrontScenarios({ scenario, openPage, check, baseUrl, admin })
import assert from "node:assert/strict";
import { noSideScroll, openAdmin, small } from "./admin-helpers.mjs";

const NOISE = /status of (400|404|409)|ERR_FAILED/;
const settingsOf = (page) => page.evaluate(async () => (await (await fetch("/api/settings")).json()).data);
const restore = (page, o) => page.evaluate(async (b) => (await fetch("/api/settings", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(b) })).status,
  { home: o.home, contact: o.contact, social: o.social, footer: o.footer, texts: o.texts, delivery: o.delivery, seo: o.seo });
const putResponse = (page) => page.waitForResponse((r) => r.url().endsWith("/api/settings") && r.request().method() === "PUT");
const openGroup = (page, name) => page.locator("summary", { hasText: name }).click();

export async function registerAdminContentStorefrontScenarios({ scenario, openPage, check, baseUrl, admin }) {
  await scenario("Storefront (new admin): hero, sections, contact and delivery reach the store; nothing saves on a validation error", async () => {
    let page, orig;
    try {
      page = await openPage();
      await page.setViewportSize({ width: 1440, height: 900 });
      await openAdmin(page, baseUrl, admin, "/storefront");
      await page.locator("#sfSave:not([disabled])").waitFor();
      orig = await settingsOf(page);

      await page.locator("#hero_title").fill("متجرنا الجديد — عطرك يحكي عنك");
      await page.getByRole("switch", { name: "إظهار الأكثر مبيعًا" }).click();
      const up = page.getByRole("button", { name: "رفع العروض" });
      for (let i = 0; i < 8 && (await up.isEnabled()); i++) await up.click();
      assert.equal(await up.isDisabled(), true, "offers moved to the top");

      // A title typed before toggling visibility is kept (legacy lost it).
      await page.getByLabel("عنوان مخصص — الأقسام").fill("تشكيلاتنا الخاصة");
      await page.getByRole("switch", { name: "إظهار الأقسام" }).click();
      await page.getByRole("switch", { name: "إظهار الأقسام" }).click();
      assert.equal(await page.getByLabel("عنوان مخصص — الأقسام").inputValue(), "تشكيلاتنا الخاصة");

      await openGroup(page, "التذييل والتواصل");
      await page.locator("#contact_phone").fill("0791234567");
      await page.locator("#social_instagram").fill("https://instagram.com/nsamat_e2e");
      await openGroup(page, "التوصيل");
      await page.locator('#governoratesBody input[value="العقبة"]').uncheck();

      // Validation blocks the save: no request at all.
      let puts = 0;
      page.on("request", (r) => { if (r.method() === "PUT" && r.url().endsWith("/api/settings")) puts += 1; });
      await page.locator("#social_tiktok").fill("http://tiktok.example");
      await page.locator("#sfSave").click();
      await page.getByText("الرابط يجب أن يبدأ بـ https").first().waitFor();
      assert.equal(puts, 0);
      await page.locator("#social_tiktok").fill("");
      for (const g of ["عمّان", "الزرقاء", "إربد", "البلقاء", "المفرق", "جرش", "عجلون", "مادبا", "الكرك", "الطفيلة", "معان"]) await page.locator(`#governoratesBody input[value="${g}"]`).uncheck();
      await page.locator("#sfSave").click();
      await page.getByRole("alert").filter({ hasText: "يجب تفعيل محافظة واحدة على الأقل" }).waitFor();
      assert.equal(puts, 0);
      for (const g of ["عمّان", "الزرقاء", "إربد", "البلقاء", "المفرق", "جرش", "عجلون", "مادبا", "الكرك", "الطفيلة", "معان"]) await page.locator(`#governoratesBody input[value="${g}"]`).check();

      // Service items: capped at four, blank rows dropped.
      const items = page.locator("#serviceItemsBody li");
      while ((await items.count()) < 4) await page.locator("#addServiceItem").click();
      assert.equal(await page.locator("#addServiceItem").isDisabled(), true);
      await page.getByRole("button", { name: "حذف العنصر 4" }).click();
      await page.locator("#addServiceItem").click(); // a blank row that must be dropped on save

      const done = putResponse(page);
      await page.locator("#sfSave").click();
      assert.equal((await done).status(), 200);
      await page.locator("#sfSuccess").waitFor();
      const saved = await settingsOf(page);
      assert.equal(saved.home.hero_title, "متجرنا الجديد — عطرك يحكي عنك");
      assert.equal(saved.home.sections[0].key, "offers");
      assert.equal(saved.home.sections.find((s) => s.key === "best_sellers").visible, false);
      assert.equal(saved.home.sections.find((s) => s.key === "aisles").title, "تشكيلاتنا الخاصة");
      assert.equal(saved.home.service_items.every((s) => s.title || s.text), true, "blank service rows dropped");
      assert.equal(saved.delivery.governorates.includes("العقبة"), false);

      const store = await openPage();
      await store.goto(`${baseUrl}/`);
      assert.match(await store.locator("#hero-title").innerText(), /متجرنا الجديد/);
      assert.equal(await store.locator('a[href="/best-sellers"]').count(), 0);
      assert.ok(await store.locator('a[href="tel:0791234567"]').count());
      assert.ok(await store.locator('a[href="https://instagram.com/nsamat_e2e"]').count());
      await store.goto(`${baseUrl}/checkout`);
      const cities = await store.locator("#co-city option").allInnerTexts();
      assert.equal(cities.includes("العقبة"), false);
      const phone = await openPage({ mobile: true });
      await phone.goto(`${baseUrl}/`);
      assert.equal(await noSideScroll(phone), true);

      // Hostile text stays text in the admin.
      await page.locator("#hero_subtitle").fill("<script>window.__xss=1</script>");
      const again = putResponse(page);
      await page.locator("#sfSave").click();
      await again;
      assert.equal(await page.evaluate(() => window.__xss), undefined);
      assert.equal(await page.locator("#hero_subtitle").inputValue(), "<script>window.__xss=1</script>");
      assert.deepEqual(page.errors.filter((e) => !NOISE.test(e)), []);
    } finally { if (page && orig) await restore(page, orig); }
  });

  await scenario("Storefront (new admin): defaults are explained and restorable, server error keeps nothing, phone layout", async () => {
    let page, orig;
    try {
      page = await openPage();
      await page.setViewportSize({ width: 1440, height: 900 });
      await openAdmin(page, baseUrl, admin, "/storefront");
      await page.locator("#sfSave:not([disabled])").waitFor();
      orig = await settingsOf(page);

      // Clearing a defaulted field shows the default as its placeholder; the server then serves the default text.
      await page.locator("#hero_title").fill("عنوان مؤقت");
      await page.getByRole("button", { name: "استعادة الافتراضي" }).first().click();
      assert.equal(await page.locator("#hero_title").inputValue(), "");
      assert.match(await page.locator("#hero_title").getAttribute("placeholder"), /عطرك يحكي عنك/);

      // A server-side rejection shows its message and says nothing was saved.
      await page.route(/\/api\/settings$/, (rt) => (rt.request().method() === "PUT"
        ? rt.fulfill({ status: 400, contentType: "application/json", body: JSON.stringify({ success: false, message: "رابط غير صالح" }) }) : rt.continue()));
      await page.locator("#hero_subtitle").fill("نص");
      await page.locator("#sfSave").click();
      await page.locator("#sfError").waitFor();
      assert.match(await page.locator("#sfError").innerText(), /رابط غير صالح.*لم يُحفظ شيء/);
      await page.unroute(/\/api\/settings$/);

      const m = await openPage({ mobile: true });
      await openAdmin(m, baseUrl, admin, "/storefront");
      await m.locator("#sfSave:not([disabled])").waitFor();
      assert.equal(await noSideScroll(m), true);
      assert.deepEqual((await small(m)).filter((x) => !/^(INPUT|TEXTAREA|SUMMARY)/.test(x)), []);
      const bar = await m.locator("#sfSave").boundingBox();
      const tabs = await m.locator('nav[aria-label="التنقل السريع"]').boundingBox();
      assert.ok(bar.y + bar.height <= tabs.y + 1, "Save bar sits above the tab bar");
      assert.deepEqual(page.errors.filter((e) => !NOISE.test(e)), []);
      void check;
    } finally { if (page && orig) await restore(page, orig); }
  });
}
