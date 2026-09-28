// Promotions e2e scenarios (Task 4: storefront slots). Registered from run.mjs after the server
// is listening; every placement seeded here is removed again, so later scenarios see none.
//
// registerPromotionScenarios({ scenario, openPage, check, baseUrl, shotDir })
import assert from "node:assert/strict";
import path from "node:path";
import Placement from "../../backend/models/placement.model.js";
import { invalidatePlacements } from "../../backend/services/placements.service.js";

// Offline stand-in "photography": a warm dusk gradient, served for https://example.com/promo-*.
const promoImage = (hue) => `<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="900" viewBox="0 0 1600 900">
<defs><radialGradient id="g" cx="25%" cy="40%" r="80%"><stop offset="0" stop-color="hsl(${hue} 55% 42%)"/><stop offset=".6" stop-color="hsl(${hue} 45% 16%)"/><stop offset="1" stop-color="#0E0C0A"/></radialGradient></defs>
<rect width="1600" height="900" fill="url(#g)"/><circle cx="420" cy="360" r="190" fill="hsl(${hue} 70% 70%)" opacity=".18"/></svg>`;

const ANNOUNCE = ["توصيل مجاني للطلبات فوق 30 دينارًا", "عطور الشتاء وصلت — اكتشفها الآن"];
const SLIDES = [
  { title: "مجموعة العود الملكي", subtitle: "دفء الخشب وعمق العنبر، لليالي الشتاء الطويلة.", cta: "تسوّق المجموعة", link: "/family/oud", hue: 30 },
  { title: "هدية تليق بمن تحب", subtitle: "علب فاخرة مغلّفة يدويًا، جاهزة للإهداء.", cta: "اختر هديتك", link: "/offers", hue: 350, theme: "light" },
];

async function seed() {
  await Placement.deleteMany({});
  await Placement.create([
    ...ANNOUNCE.map((title, sort) => ({ slot: "announcement", title, sort, link: sort ? "/new" : undefined })),
    ...SLIDES.map(({ hue, ...s }, sort) => ({ slot: "hero", ...s, image: `https://example.com/promo-${hue}.svg`, sort })),
  ]);
  invalidatePlacements();
}

async function promoPage(openPage, viewport) {
  const page = await openPage({ mobile: viewport.width < 900 });
  await page.setViewportSize(viewport);
  await page.route("https://example.com/**", (route) => {
    const hue = Number(route.request().url().match(/promo-(\d+)/)?.[1] ?? 40);
    return route.fulfill({ status: 200, contentType: "image/svg+xml", body: promoImage(hue) });
  });
  return page;
}

const visibleAnnouncement = (page) => page.locator(".announce-item:not([hidden])").innerText();

export async function registerPromotionScenarios({ scenario, openPage, check, baseUrl, shotDir }) {
  await scenario("Promotions render", async () => {
    await seed();
    try {
      for (const viewport of [{ width: 1440, height: 900 }, { width: 375, height: 812 }]) {
        const page = await promoPage(openPage, viewport);
        assert.equal((await page.goto(`${baseUrl}/`)).status(), 200);
        await page.waitForLoadState("networkidle");

        // The brand slide first; the next arrow shows slide 2 (the first admin slide).
        const bar = page.locator("[data-announce]");
        assert.ok(await bar.isVisible(), "announcement bar shows");
        assert.equal(await page.locator("h1").count(), 1);
        await page.locator("[data-hero-controls]").waitFor();
        assert.ok(await page.locator("h1").isVisible());
        await page.screenshot({ path: path.join(shotDir, `p4-home-${viewport.width}.png`) });
        await page.locator("[data-hero-next]").click();
        await page.getByRole("heading", { name: SLIDES[0].title }).waitFor({ state: "visible" });
        await page.locator("h1").waitFor({ state: "hidden" });
        assert.equal(await page.locator("[data-hero-dot][aria-current]").getAttribute("aria-label"), "الشريحة 2");
        assert.equal(await page.locator(".hero-slide.is-active .promo-cta").getAttribute("href"), SLIDES[0].link);
        await page.screenshot({ path: path.join(shotDir, `p4-home-${viewport.width}-slide2.png`) });
        // Dots jump straight to a slide; prev wraps back to the brand welcome.
        await page.locator('[data-hero-dot="2"]').click();
        await page.getByRole("heading", { name: SLIDES[1].title }).waitFor({ state: "visible" });
        await page.locator("[data-hero-prev]").click();
        await page.locator("[data-hero-prev]").click();
        await page.locator("h1").waitFor({ state: "visible" });

        const [sw, iw] = await page.evaluate(() => [document.documentElement.scrollWidth, window.innerWidth]);
        assert.ok(sw <= iw, `horizontal scroll at ${viewport.width}px: ${sw} > ${iw}`);
        assert.equal(iw, viewport.width, `layout viewport widened at ${viewport.width}px`);

        // Dismissal hides the bar and lasts for the session (a reload in the same tab).
        await page.getByRole("button", { name: "إغلاق الإعلان" }).click();
        assert.ok(await bar.isHidden());
        await page.reload();
        await page.waitForLoadState("networkidle");
        assert.ok(await page.locator("[data-announce]").isHidden(), "stays dismissed after reload");
        check(page);
        await page.close();
      }

      // Rotation: the bar moves on after 5 s, but never under reduced motion.
      for (const reducedMotion of ["no-preference", "reduce"]) {
        const page = await promoPage(openPage, { width: 1440, height: 900 });
        await page.emulateMedia({ reducedMotion });
        await page.goto(`${baseUrl}/`);
        await page.waitForLoadState("networkidle");
        await page.mouse.move(5, 600); // keep the pointer off the bar (hover pauses rotation)
        assert.equal(await visibleAnnouncement(page), ANNOUNCE[0]);
        await page.waitForTimeout(6000);
        assert.equal(await visibleAnnouncement(page), reducedMotion === "reduce" ? ANNOUNCE[0] : ANNOUNCE[1], `rotation with ${reducedMotion}`);
        check(page);
        await page.close();
      }
    } finally {
      await Placement.deleteMany({});
      invalidatePlacements();
    }
  });
}
