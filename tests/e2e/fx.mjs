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
}
