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
// `payloads` is required: the page must show every one of them before the negative checks run.
export async function assertPageIsXssSafe(page, payloads) {
  if (!Array.isArray(payloads) || payloads.length === 0) throw new Error("assertPageIsXssSafe needs a non-empty payloads array");
  await page.waitForFunction((ps) => ps.every((p) => document.body.innerText.includes(p)), payloads, { timeout: 10000 });
  assert.equal(await page.evaluate(() => window.__xss), undefined, "a payload script ran");
  assert.equal(await page.locator("img[onerror], svg[onload], [onmouseover]").count(), 0, "hostile markup was injected");
  const hrefs = await page.$$eval('a[href^="https://wa.me/"]', (as) => as.map((a) => a.getAttribute("href")));
  for (const h of hrefs) assert.match(h, /^https:\/\/wa\.me\/962\d{9}$/);
}

export const money = (n) => `${(Number(n) || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} JOD`;
export const esc = (s) => s.replace(/[.+*?^${}()|[\]\\]/g, "\\$&");
// Interactive controls under 44px tall inside <main> (touch-target sweep).
export const small = (page) => page.evaluate(() => [...document.querySelectorAll("main a, main button, main select, main input")]
  .map((el) => [el, el.getBoundingClientRect()]).filter(([, r]) => r.width > 0 && r.height > 0 && r.height < 44)
  .map(([el]) => `${el.tagName} ${el.getAttribute("aria-label") || el.textContent.trim().slice(0, 20)}`));
export const card = (page, label) => page.locator("main div.rounded-xl", { has: page.getByText(label, { exact: true }) }).first();

// API-only admin session for scenarios that only need admin data changes (the cookie lands in the shared context).
export async function apiLogin(page, baseUrl, admin) {
  const res = await page.request.post(`${baseUrl}/api/auth/login`, { data: { username: admin.username, password: admin.password } });
  assert.equal(res.status(), 200);
}
export async function apiCall(page, baseUrl, method, path, data) {
  const res = await page.request.fetch(`${baseUrl}/api${path}`, { method, data });
  return { status: res.status(), body: await res.json().catch(() => null) };
}
