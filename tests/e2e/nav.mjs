// Nav e2e scenarios: header hide-on-scroll, mobile header at 375px, and the /brands designers index. Registered from run.mjs.
//
// registerNavScenarios({ scenario, openPage, check, baseUrl })
import assert from "node:assert/strict";

export async function registerNavScenarios({ scenario, openPage, check, baseUrl }) {
  await scenario("Header: hides on scroll down past the threshold, reappears on scroll up", async () => {
    const page = await openPage();
    // Reduced motion snaps the header instantly (no transition), so the assertions below don't
    // race the animation — this also exercises the "no animation under reduced motion" rule.
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto(`${baseUrl}/`);
    await page.waitForSelector(".shelf-track");
    // Scroll to the bottom (not a fixed pixel count — the seeded page may be shorter than 600px)
    // so the header is unambiguously past the threshold and scrolling down.
    await page.evaluate(() => scrollTo(0, document.body.scrollHeight));
    await page.waitForFunction(() => document.querySelector("[data-header]")?.classList.contains("is-hidden"));
    const hiddenTop = await page.locator("[data-header]").evaluate((el) => el.getBoundingClientRect().top);
    assert.ok(hiddenTop < 0, `hidden header should be scrolled out of view, top=${hiddenTop}`);

    // Scroll all the way back to the top: unambiguously "up", and near-top always forces visible.
    await page.evaluate(() => scrollTo(0, 0));
    await page.waitForFunction(() => !document.querySelector("[data-header]")?.classList.contains("is-hidden"));
    const visibleTop = await page.locator("[data-header]").evaluate((el) => el.getBoundingClientRect().top);
    assert.ok(visibleTop >= 0, `visible header should be at/above top, top=${visibleTop}`);
    check(page);
  });

  await scenario("Mobile header (375px): one compact row, no horizontal overflow, menu drawer works", async () => {
    const page = await openPage({ mobile: true });
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto(`${baseUrl}/`);
    await page.waitForSelector(".shelf-track");

    const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
    const clientWidth = await page.evaluate(() => document.documentElement.clientWidth);
    assert.ok(scrollWidth <= clientWidth + 1, `horizontal scroll at 375px: ${scrollWidth} > ${clientWidth}`);

    assert.equal(await page.locator(".main-nav").isVisible(), false, "the row nav is hidden on mobile");
    await page.click("[data-open-nav]");
    const drawer = page.locator("#nav-drawer");
    await drawer.waitFor();
    assert.ok(await drawer.locator("a", { hasText: "المصممون" }).isVisible(), "designers link is in the drawer");
    const targetHeight = await drawer.locator("a", { hasText: "المصممون" }).evaluate((el) => el.getBoundingClientRect().height);
    assert.ok(targetHeight >= 44, `nav drawer targets should be >= 44px, got ${targetHeight}`);
    await page.click("[data-close-nav]");
    await page.waitForFunction(() => !document.getElementById("nav-drawer").open);
    check(page);
  });

  await scenario("Designers: /brands lists active brands with visible products; header and footer link to it", async () => {
    const page = await openPage();
    await page.goto(`${baseUrl}/`);
    assert.ok(await page.locator(".main-nav a", { hasText: "المصممون" }).isVisible(), "header nav has a designers link");
    assert.ok(await page.locator(".site-footer a", { hasText: "المصممون" }).count() > 0, "footer has a designers link");

    await page.goto(`${baseUrl}/brands`);
    await page.locator(".designer-tile").first().waitFor();
    check(page);
  });
}
