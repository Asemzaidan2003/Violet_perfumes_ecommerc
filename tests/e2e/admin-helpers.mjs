// Shared helpers for the new React admin scenarios.
import assert from "node:assert/strict";

// Logs in through the API (cookie lands in the page's context; going through the form would log a
// 401 from the first /api/auth/me probe, which check() counts as noise) and opens an admin route.
export async function openAdmin(page, baseUrl, admin, path = "/") {
  const res = await page.request.post(`${baseUrl}/api/auth/login`, { data: { username: admin.username, password: admin.password } });
  assert.equal(res.status(), 200);
  await page.goto(`${baseUrl}/admin${path}`);
}

export const noSideScroll = (page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);

// Hostile strings must render as literal text and never as live markup or scripts.
export async function assertPageIsXssSafe(page, payloads = []) {
  assert.equal(await page.evaluate(() => window.__xss), undefined, "a payload script ran");
  assert.equal(await page.locator("img[onerror], svg[onload], [onmouseover]").count(), 0, "hostile markup was injected");
  const text = await page.evaluate(() => document.body.innerText);
  for (const p of payloads) assert.ok(text.includes(p), `payload not visible literally: ${p}`);
  const hrefs = await page.$$eval('a[href^="https://wa.me/"]', (as) => as.map((a) => a.getAttribute("href")));
  for (const h of hrefs) assert.match(h, /^https:\/\/wa\.me\/962\d{9}$/);
}
