// Immersive layer e2e scenarios (Task 1: capability gate, reveals, view transitions).
// registerFxScenarios({ scenario, openPage, check, baseUrl })
import assert from "node:assert/strict";

const allOpaque = (page) => page.evaluate(() =>
  [...document.querySelectorAll("[data-reveal]")].every((el) => getComputedStyle(el).opacity === "1"));

export async function registerFxScenarios({ scenario, openPage, check, baseUrl, productId }) {
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

    // Reload in the same context: the stamp written at the start suppresses a replay. The overlay
    // markup is always server-rendered (hidden in CSS by default); what must not happen is html
    // ever getting .fx-entrance, which is the only thing that makes it visible.
    await page.goto(`${baseUrl}/`);
    await page.waitForLoadState("networkidle");
    assert.ok(!(await page.evaluate(() => document.documentElement.classList.contains("fx-entrance"))),
      "the fresh stamp suppresses the overlay on the next load");
    assert.equal(await page.locator("[data-fx-entrance]").evaluate((el) => getComputedStyle(el).display), "none");
    check(page);

    // Reduced motion: never shows, even with no stamp at all.
    const rmPage = await openPage();
    await rmPage.emulateMedia({ reducedMotion: "reduce" });
    await rmPage.setViewportSize({ width: 1440, height: 900 });
    await rmPage.goto(`${baseUrl}/`);
    await rmPage.evaluate(() => localStorage.removeItem("nsamat_entrance"));
    await rmPage.reload();
    await rmPage.waitForLoadState("networkidle");
    assert.ok(!(await rmPage.evaluate(() => document.documentElement.classList.contains("fx-entrance"))),
      "no overlay under reduced motion");
    check(rmPage);
  });

  await scenario("360 viewer", async () => {
    const page = await openPage();
    await page.setViewportSize({ width: 1440, height: 900 });

    const requests = [];
    page.on("request", (req) => requests.push(req.url()));

    await page.goto(`${baseUrl}/p/${productId}`);
    await page.waitForLoadState("networkidle");

    const hasWebGL2 = await page.evaluate(() => {
      try { return !!document.createElement("canvas").getContext("webgl2"); } catch { return false; }
    });
    const rich3d = await page.evaluate(() => document.documentElement.classList.contains("fx-motion"))
      && hasWebGL2;

    assert.ok(!requests.some((u) => u.includes("three.module.js")), "no three.js request before the click");

    const btn = page.locator("[data-viewer360]");
    if (!rich3d) {
      console.log("SKIP: WebGL2 unavailable in this headless Edge even with SwiftShader — button stays hidden");
      assert.equal(await btn.isVisible(), false, "the 360° button stays hidden without rich3d");
      check(page);
      return;
    }
    console.log("RAN: WebGL2 available (SwiftShader) — full 360° viewer path exercised");

    await btn.waitFor({ state: "visible" });
    await btn.click();
    const canvas = page.locator("canvas[role=img]");
    await canvas.waitFor({ state: "visible", timeout: 5000 });
    assert.ok(requests.some((u) => u.includes("three.module.js")), "three.js was requested after the click");

    const before = await canvas.getAttribute("data-yaw");
    const box = await canvas.boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2 + 120, box.y + box.height / 2, { steps: 10 });
    await page.mouse.up();
    await page.waitForFunction((prev) => document.querySelector("canvas[role=img]")?.dataset.yaw !== prev, before);

    await page.keyboard.press("Escape");
    await page.waitForSelector("canvas[role=img]", { state: "detached" });
    await page.locator(".gallery-slide").first().waitFor({ state: "visible" });

    for (let i = 0; i < 5; i++) {
      await btn.click();
      await canvas.waitFor({ state: "visible", timeout: 5000 });
      await page.locator(".viewer360-close").click();
      await page.waitForSelector("canvas[role=img]", { state: "detached" });
    }
    const liveRenderers = await page.evaluate(() => window.__fxRenderers ?? 0);
    assert.ok(liveRenderers <= 1, `at most 1 live renderer after 5 open/close cycles, got ${liveRenderers}`);

    check(page);
  });
}
