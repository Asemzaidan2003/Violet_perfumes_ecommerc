// Immersive layer e2e scenarios (Task 1: capability gate, reveals, view transitions).
// registerFxScenarios({ scenario, openPage, check, baseUrl })
import assert from "node:assert/strict";

const allOpaque = (page) => page.evaluate(() =>
  [...document.querySelectorAll("[data-reveal]")].every((el) => getComputedStyle(el).opacity === "1"));

export async function registerFxScenarios({ scenario, openPage, check, baseUrl }) {
  await scenario("Motion basics", async () => {
    const page = await openPage();
    await page.setViewportSize({ width: 1440, height: 900 });
    const res = await page.goto(`${baseUrl}/`);
    assert.equal(res.status(), 200);
    await page.waitForLoadState("networkidle");

    assert.ok(await page.evaluate(() => document.documentElement.classList.contains("fx-motion")),
      "html carries fx-motion when motion is allowed");

    await page.evaluate(() => scrollTo(0, document.body.scrollHeight));
    await page.waitForFunction(() =>
      [...document.querySelectorAll("[data-reveal]")].every((el) => getComputedStyle(el).opacity === "1"),
      { timeout: 2000 });
    assert.ok(await allOpaque(page), "every [data-reveal] block reaches opacity 1 after scrolling");

    await Promise.all([
      page.waitForURL(/\/p\//),
      page.locator(".card-link").first().click(),
    ]);
    check(page);

    // Reduced motion: reload in a fresh context with the media feature emulated.
    const rmPage = await openPage();
    await rmPage.emulateMedia({ reducedMotion: "reduce" });
    await rmPage.setViewportSize({ width: 1440, height: 900 });
    await rmPage.goto(`${baseUrl}/`);
    await rmPage.waitForLoadState("networkidle");

    assert.ok(!(await rmPage.evaluate(() => document.documentElement.classList.contains("fx-motion"))),
      "html has no fx-motion under prefers-reduced-motion: reduce");
    assert.ok(await allOpaque(rmPage), "every [data-reveal] block is already opacity 1, without scrolling");
    check(rmPage);
  });

  await scenario("Add-to-cart flight", async () => {
    const page = await openPage();
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(`${baseUrl}/`);
    await page.waitForLoadState("networkidle");
    await page.evaluate(() => localStorage.removeItem("nsamat_cart_v1"));

    await page.locator(".card-add").first().click();
    await page.waitForSelector(".fx-flight", { timeout: 500 });
    await page.waitForSelector(".fx-flight", { state: "detached", timeout: 1000 });
    await page.waitForFunction(() =>
      [...document.querySelectorAll("[data-cart-count]")].some((el) => !el.hidden && el.textContent === "1"));

    await page.evaluate(() => localStorage.removeItem("nsamat_cart_v1"));
    check(page);
  });

  await scenario("Doors of light entrance", async () => {
    const page = await openPage();
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(`${baseUrl}/`);
    await page.evaluate(() => localStorage.removeItem("nsamat_entrance"));
    await page.reload();
    await page.waitForLoadState("domcontentloaded");

    assert.ok(await page.locator("[data-fx-entrance]").count() > 0, "overlay is rendered on a fresh load");

    // Input goes straight through even while the entrance is still playing: a click 100ms after
    // domcontentloaded must still navigate (pointer-events: none from the first frame).
    await page.waitForTimeout(100);
    await Promise.all([
      page.waitForURL(/\/p\//),
      page.locator(".card-link").first().click(),
    ]);
    check(page);

    // Reload in the same context: the stamp written at the start suppresses a replay.
    await page.goto(`${baseUrl}/`);
    await page.waitForLoadState("networkidle");
    assert.equal(await page.locator("[data-fx-entrance]").count(), 0, "the fresh stamp suppresses the overlay on the next load");
    check(page);

    // Reduced motion: never shows, even with no stamp at all.
    const rmPage = await openPage();
    await rmPage.emulateMedia({ reducedMotion: "reduce" });
    await rmPage.setViewportSize({ width: 1440, height: 900 });
    await rmPage.goto(`${baseUrl}/`);
    await rmPage.evaluate(() => localStorage.removeItem("nsamat_entrance"));
    await rmPage.reload();
    await rmPage.waitForLoadState("networkidle");
    assert.equal(await rmPage.locator("[data-fx-entrance]").count(), 0, "no overlay under reduced motion");
    check(rmPage);
  });
}
