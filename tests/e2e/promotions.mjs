// Promotions e2e scenarios (Task 4: storefront slots). Registered from run.mjs after the server
// is listening; every placement seeded here is removed again, so later scenarios see none.
//
// registerPromotionScenarios({ scenario, openPage, check, baseUrl, shotDir })
import assert from "node:assert/strict";
import path from "node:path";
import Placement from "../../backend/models/placement.model.js";
import Coupon from "../../backend/models/coupon.model.js";
import Product from "../../backend/models/product.model.js";
import { invalidatePlacements } from "../../backend/services/placements.service.js";
import { invalidateCatalog } from "../../backend/store/catalog.js";

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

// "Promotions render" clears the shared context's cookies at the end of each viewport pass, so
// any admin scenario after it needs its own fresh login (the "Admin login" cookie is long gone).
async function loginAdmin(openPage, baseUrl, admin) {
  const page = await openPage();
  await page.goto(`${baseUrl}/admin/html/login.html`);
  await page.fill("#username", admin.username);
  await page.fill("#password", admin.password);
  await Promise.all([page.waitForURL(/index\.html/), page.click("#loginForm button[type=submit]")]);
  return page;
}

export async function registerPromotionScenarios({ scenario, openPage, check, baseUrl, shotDir, admin }) {
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
        assert.equal(await page.locator("[data-announce]").count(), 0, "after dismissal the server leaves the bar out (no flash)");
        await page.context().clearCookies(); // the context is shared with later scenarios
        check(page);
        await page.close();
      }

      // Hero auto-advance runs, and the visible pause toggle stops it (WCAG 2.2.2).
      {
        const page = await promoPage(openPage, { width: 1440, height: 900 });
        await page.goto(`${baseUrl}/`);
        await page.waitForLoadState("networkidle");
        await page.mouse.move(5, 5); // off the hero: hover would pause it
        const active = () => page.locator("[data-hero-dot][aria-current]").getAttribute("aria-label");
        assert.equal(await active(), "الشريحة 1");
        await page.waitForFunction(() => document.querySelector("[data-hero-dot][aria-current]")?.getAttribute("aria-label") === "الشريحة 2",
          null, { timeout: 7500 });
        const pause = page.locator("[data-hero-pause]");
        await pause.click();
        assert.equal(await pause.getAttribute("aria-pressed"), "true");
        assert.equal(await pause.getAttribute("aria-label"), "تشغيل العرض التلقائي");
        await page.evaluate(() => document.activeElement.blur()); // focus alone would also pause it
        await page.mouse.move(5, 5);
        await page.waitForTimeout(7500);
        assert.equal(await active(), "الشريحة 2", "paused: the slide stays");
        await pause.click();
        assert.equal(await pause.getAttribute("aria-label"), "إيقاف العرض التلقائي");
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

  await scenario("Promotions: grid tiles fit the aisle grid", async () => {
    const extra = await Product.insertMany(Array.from({ length: 13 }, (_, i) => ({
      p_name: `رجالي تجريبي ${i + 1}`, p_image: ".", p_category: "Men", oil_id: "OIL1", oil_percentage: 20, alcohol_percentage: 80,
      size_list: [{ size: "50", price: 10 + i }],
    })));
    invalidateCatalog();
    await Placement.create([
      { slot: "grid_tile", title: "جرّب قبل أن تشتري", subtitle: "عينات مجانية مع كل طلب", link: "/offers", cta: "اعرف المزيد", image: "https://example.com/promo-40.svg" },
      { slot: "grid_tile", title: "بطاقة ذهبية بعنوان طويل نسبيًا يختبر الالتفاف", link: "/offers", cta: "اطلب", theme: "gold", image: "https://example.com/promo-50.svg", sort: 1 },
    ]);
    invalidatePlacements();
    try {
      for (const viewport of [{ width: 375, height: 812 }, { width: 1440, height: 900 }]) {
        const page = await promoPage(openPage, viewport);
        await page.goto(`${baseUrl}/c/men`);
        await page.waitForLoadState("networkidle");
        assert.ok(await page.locator(".grid-promo:not([hidden])").count() >= 2, "two tiles placed");
        const [sw, iw] = await page.evaluate(() => [document.documentElement.scrollWidth, window.innerWidth]);
        assert.ok(sw <= iw, `horizontal scroll at ${viewport.width}px on /c/men: ${sw} > ${iw}`);
        assert.equal(iw, viewport.width, `layout viewport widened at ${viewport.width}px`);
        // No tile overlaps a card, and each tile stays inside its own grid cell.
        const overlaps = await page.evaluate(() => {
          const r = (el) => el.getBoundingClientRect();
          const hit = (a, b) => a.left < b.right - 0.5 && b.left < a.right - 0.5 && a.top < b.bottom - 0.5 && b.top < a.bottom - 0.5;
          const out = [];
          for (const li of document.querySelectorAll(".grid-promo:not([hidden])")) {
            const tile = r(li.querySelector(".promo-tile"));
            const cell = r(li);
            if (tile.right > cell.right + 0.5 || tile.left < cell.left - 0.5 || tile.bottom > cell.bottom + 0.5) out.push("tile leaves its cell");
            for (const card of document.querySelectorAll(".grid-item:not([hidden])")) if (hit(tile, r(card))) out.push(card.dataset.id);
          }
          return out;
        });
        assert.deepEqual(overlaps, []);
        await page.locator(".grid-promo").first().scrollIntoViewIfNeeded();
        await page.screenshot({ path: path.join(shotDir, `p4-aisle-${viewport.width}.png`) });
        check(page);
        await page.close();
      }
    } finally {
      await Placement.deleteMany({});
      invalidatePlacements();
      await Product.deleteMany({ _id: { $in: extra.map((p) => p._id) } });
      invalidateCatalog();
    }
  });

  // Task 6: the admin promotions page itself — placements + coupons CRUD, escaping, validation.
  await scenario("Admin promotions", async () => {
    await Placement.deleteMany({});
    await Coupon.deleteMany({});
    invalidatePlacements();
    const HOSTILE_TITLE = "عرض <b>&</b> 'خاص'";
    try {
      const page = await loginAdmin(openPage, baseUrl, admin);
      await page.goto(`${baseUrl}/admin/html/promotions.html`);
      await page.waitForLoadState("networkidle");

      // --- Create an announcement with a hostile title: literal text everywhere, never markup.
      await page.click("#addPlacementBtn");
      await page.selectOption("#pf-slot", "announcement");
      await page.fill("#pf-title", HOSTILE_TITLE);
      const created = page.waitForResponse((r) => r.url().endsWith("/api/placements") && r.request().method() === "POST");
      await page.click("#placementSave");
      assert.equal((await created).status(), 201);
      await page.locator("#placementModal.open").waitFor({ state: "hidden" });
      const listedRow = page.locator(".promo-row", { hasText: HOSTILE_TITLE });
      await listedRow.first().waitFor();
      assert.equal(await listedRow.locator("b").count(), 0, "hostile markup must render as literal text, not an element");
      await page.screenshot({ path: path.join(shotDir, "p6-promotions-1440.png") });

      // --- The same literal text shows in the storefront announcement bar.
      const storePage = await openPage();
      await storePage.goto(`${baseUrl}/`);
      await storePage.waitForLoadState("networkidle");
      assert.ok((await storePage.locator(".announce-item").innerText()).includes(HOSTILE_TITLE));
      assert.equal(await storePage.locator(".announce-item b").count(), 0);
      await storePage.close();

      // --- Toggling it inactive removes it from the storefront after a reload (cache invalidated).
      const toggled = page.waitForResponse((r) => /\/api\/placements\/[a-f0-9]{24}$/.test(r.url()) && r.request().method() === "PUT");
      await listedRow.locator(".pf-active-toggle").click();
      assert.equal((await toggled).status(), 200);
      await listedRow.locator("text=متوقف").waitFor();
      const storePage2 = await openPage();
      await storePage2.goto(`${baseUrl}/`);
      await storePage2.waitForLoadState("networkidle");
      assert.equal(await storePage2.locator("[data-announce]").count(), 0, "an inactive announcement must not render");
      await storePage2.close();

      // --- Reorder: two announcements tie on sort (the form defaults it to 0), the classic case
      // where swapping raw sort values is a no-op. Pressing ↓ on the first must still swap them.
      const addAnnouncement = async (title) => {
        await page.click("#addPlacementBtn");
        await page.selectOption("#pf-slot", "announcement");
        await page.fill("#pf-title", title);
        const created = page.waitForResponse((r) => r.url().endsWith("/api/placements") && r.request().method() === "POST");
        await page.click("#placementSave");
        assert.equal((await created).status(), 201);
        await page.locator("#placementModal.open").waitFor({ state: "hidden" });
      };
      await addAnnouncement("إعلان ترتيب أ");
      await addAnnouncement("إعلان ترتيب ب");

      const announceGroup = page.locator(".promo-group", { has: page.locator("h3", { hasText: "الشريط الإعلاني" }) });
      const orderedTitles = async () => (await announceGroup.locator(".promo-title").allInnerTexts())
        .filter((t) => t.includes("إعلان ترتيب"));
      assert.deepEqual(await orderedTitles(), ["إعلان ترتيب أ", "إعلان ترتيب ب"]);

      await page.getByRole("button", { name: "خفض إعلان ترتيب أ" }).click();
      await announceGroup.locator(".promo-title").first().waitFor(); // list re-rendered after the reload
      await page.waitForFunction((expected) => {
        const titles = [...document.querySelectorAll(".promo-title")].map((el) => el.textContent);
        const filtered = titles.filter((t) => t.includes("إعلان ترتيب"));
        return JSON.stringify(filtered) === JSON.stringify(expected);
      }, ["إعلان ترتيب ب", "إعلان ترتيب أ"]);
      assert.deepEqual(await orderedTitles(), ["إعلان ترتيب ب", "إعلان ترتيب أ"]);

      check(page); // the happy path so far: no console/CSP noise. Below, every step deliberately
      // triggers a 400/409 to check the error UI — Edge itself logs those failed fetches to the
      // console (see admin-online.mjs's "Settings round trip"), so check(page) isn't called again.

      // --- Coupons: create TEST20, see it listed as 0/∞, and a duplicate code is rejected.
      await page.click(".tab-btn[data-tab=\"coupons\"]");
      await page.click("#addCouponBtn");
      await page.fill("#cf-code", "TEST20");
      await page.selectOption("#cf-type", "percent");
      await page.fill("#cf-value", "20");
      const couponCreated = page.waitForResponse((r) => r.url().endsWith("/api/coupons") && r.request().method() === "POST");
      await page.click("#couponSave");
      assert.equal((await couponCreated).status(), 201);
      await page.locator("#couponModal.open").waitFor({ state: "hidden" });
      const couponRow = page.locator("#couponsBody tr", { hasText: "TEST20" });
      await couponRow.first().waitFor();
      assert.match(await couponRow.first().innerText(), /0\s*\/\s*∞/);

      await page.click("#addCouponBtn");
      await page.fill("#cf-code", "test20"); // lowercase — normalizes to the same existing code
      await page.selectOption("#cf-type", "percent");
      await page.fill("#cf-value", "5");
      const dupRejected = page.waitForResponse((r) => r.url().endsWith("/api/coupons") && r.request().method() === "POST");
      await page.click("#couponSave");
      assert.equal((await dupRejected).status(), 409);
      await page.locator("#couponError:not([hidden])").waitFor();
      await page.click("#couponClose");

      // --- Placements: a hostile link is rejected, and nothing is saved.
      await page.click(".tab-btn[data-tab=\"placements\"]");
      const beforeCount = await page.locator(".promo-row").count();
      await page.click("#addPlacementBtn");
      await page.selectOption("#pf-slot", "announcement");
      await page.fill("#pf-title", "إعلان رابط خبيث");
      await page.fill("#pf-link", "javascript:alert(1)");
      const linkRejected = page.waitForResponse((r) => r.url().endsWith("/api/placements") && r.request().method() === "POST");
      await page.click("#placementSave");
      assert.equal((await linkRejected).status(), 400);
      await page.locator("#placementError:not([hidden])").waitFor();
      await page.click("#placementClose");
      assert.equal(await page.locator(".promo-row").count(), beforeCount, "the rejected placement must not be saved");

      // --- A hero placement with no image is rejected.
      await page.click("#addPlacementBtn");
      await page.selectOption("#pf-slot", "hero");
      await page.fill("#pf-title", "شريحة بلا صورة");
      const heroRejected = page.waitForResponse((r) => r.url().endsWith("/api/placements") && r.request().method() === "POST");
      await page.click("#placementSave");
      assert.equal((await heroRejected).status(), 400);
      await page.locator("#placementError:not([hidden])").waitFor();
      await page.close();
    } finally {
      await Placement.deleteMany({});
      await Coupon.deleteMany({});
      invalidatePlacements();
    }
  });
}
