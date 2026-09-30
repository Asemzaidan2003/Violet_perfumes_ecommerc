// Real-browser e2e harness: drives the Microsoft Edge already installed on this
// machine (via playwright-core, channel "msedge", no browser download) against
// the app on its own throwaway local DB. Run: npm run test:e2e
//
// Later sub-projects add scenarios to this file — call scenario(name, fn) in
// sequence below; each fn gets a fresh page via openPage() and should end with
// check(page) to fail on any console/pageerror/CSP noise.
import assert from "node:assert/strict";
import { once } from "node:events";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import mongoose from "mongoose";
import { chromium } from "playwright-core";
import { createApp } from "../../backend/app.js";
import { hashPassword } from "../../backend/middleware/auth.js";
import User from "../../backend/models/user.model.js";
import Oil from "../../backend/models/oil.model.js";
import Bottle from "../../backend/models/bottle.model.js";
import Alcohol from "../../backend/models/alcohol.model.js";
import Product from "../../backend/models/product.model.js";
import { invalidateCatalog } from "../../backend/store/catalog.js";
import Interest from "../../backend/models/interest.model.js";
import { isSelected, registerAllScenarios } from "./scenario-registry.mjs";

process.env.SESSION_SECRET ||= "e2e-secret-".padEnd(48, "x");

const ADMIN_USER = "admin";
const ADMIN_PASS = "e2e-pass-123";
const SEEDED_PRODUCT_NAME = "منتج مصدر تجريبي";
// 1x1 transparent PNG — same bytes tests/uploads.test.js uses.
const PNG_BASE64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

const dbName = `nsamat_e2e_${process.pid}`;
const uri = `mongodb://127.0.0.1:27017/${dbName}?replicaSet=rs0`;
const pngPath = path.join(os.tmpdir(), `nsamat-e2e-${process.pid}.png`);

let server, browser, browser3d, context, mobileContext;
// Never touch the internet: outside image hosts answer with the test PNG (page-level routes still win).
const offline = async (ctx) => { await ctx.route((url) => url.hostname !== "127.0.0.1", (rt) => rt.fulfill({ status: 200, contentType: "image/png", body: Buffer.from(PNG_BASE64, "base64") })); return ctx; };
const MOBILE = { viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true };
async function use3d() {
  browser3d = await chromium.launch({ channel: "msedge", headless: true, args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
  [context, mobileContext] = [await offline(await browser3d.newContext()), await offline(await browser3d.newContext(MOBILE))];
}
const results = [];
let openPages = [];

async function openPage({ mobile = false } = {}) {
  const page = await (mobile ? mobileContext : context).newPage();
  openPages.push(page);
  const errors = [];
  page.on("console", (msg) => {
    if (msg.type() !== "error" && !msg.text().includes("Content Security Policy")) return;
    const loc = msg.location();
    // Harmless noise: the browser auto-requests /favicon.ico and no route serves one.
    if (loc?.url && /\/favicon\.ico$/i.test(loc.url)) return;
    errors.push(`[${msg.type()}] ${msg.text()} (${loc?.url ?? ""})`);
  });
  page.on("pageerror", (err) => errors.push(`[pageerror] ${err.message || err}`));
  page.on("dialog", (d) => d.accept().catch(() => {}));
  page.errors = errors;
  return page;
}

function check(page) {
  assert.deepEqual(page.errors, [], `console/pageerror/CSP noise on ${page.url()}: ${JSON.stringify(page.errors)}`);
}

async function scenario(name, fn) {
  if (!isSelected(name)) { console.log(`SKIP: ${name}`); return; }
  try {
    await fn();
    console.log(`PASS: ${name}`);
    results.push({ name, ok: true });
  } catch (err) {
    console.log(`FAIL: ${name}`);
    console.log(err?.stack || err);
    results.push({ name, ok: false });
  } finally {
    // Close a scenario's pages so their rAF loops (hero 3D) don't keep running.
    const pages = openPages;
    openPages = [];
    await Promise.all(pages.map((p) => p.close().catch(() => {})));
  }
}

async function run() {
  await mongoose.connect(uri);
  await mongoose.connection.dropDatabase();

  await User.create({ username: ADMIN_USER, password_hash: await hashPassword(ADMIN_PASS), role: "admin" });
  await Oil.create({ id: "OIL1", oil_name: "زيت تجريبي", oil_cost: 0.5, oil_quantity: 100 });
  await Bottle.create({ name: "زجاجة 30 مل", capacity: 30, cost: 0.2, quantity: 100 });
  await Alcohol.create({ name: "كحول تجريبي", type: "ethanol", quantity: 1000, cost: 0.1 });
  const seeded = await Product.create({
    p_name: SEEDED_PRODUCT_NAME,
    p_image: "https://example.com/seed.jpg",
    p_category: "Men",
    oil_id: "OIL1",
    oil_percentage: 20,
    alcohol_percentage: 80,
    size_list: [{ size: "50", price: 40 }],
  });

  server = createApp().listen(0, "127.0.0.1");
  await once(server, "listening");
  const baseUrl = `http://127.0.0.1:${server.address().port}`;

  await fs.writeFile(pngPath, Buffer.from(PNG_BASE64, "base64"));

  // No WebGL2 here; 3D scenarios switch via use3d() (SwiftShader would starve unrelated pages).
  browser = await chromium.launch({ channel: "msedge", headless: true });
  context = await offline(await browser.newContext());
  mobileContext = await offline(await browser.newContext(MOBILE));

  await scenario("Admin login", async () => {
    const page = await openPage();
    await page.goto(`${baseUrl}/admin/login`);
    await page.fill("#username", ADMIN_USER);
    await page.fill("#password", ADMIN_PASS);
    await Promise.all([page.waitForURL(/\/admin\/pos$/), page.click("form button[type=submit]")]);
    // The login page's first /api/auth/me probe is an expected 401; anything else is noise.
    assert.deepEqual(page.errors.filter((e) => !/status of 401/.test(e)), []);
    // Legacy bookmarks land on the matching route.
    await page.goto(`${baseUrl}/admin/html/all_products.html`);
    await page.waitForURL(/\/admin\/products$/);
    check(page);
  });

  await scenario("Storefront home", async () => {
    // A hotlinked photo that no longer decodes must fall back to the branded placeholder.
    await Product.create({
      p_name: "عطر صورته مكسورة", p_image: "https://example.com/broken.jpg", p_category: "Women",
      oil_id: "OIL1", oil_percentage: 20, alcohol_percentage: 80, size_list: [{ size: "30", price: 18 }],
    });
    invalidateCatalog();

    for (const viewport of [{ width: 1440, height: 900 }, { width: 375, height: 812 }]) {
      const page = await openPage({ mobile: viewport.width < 900 });
      await page.setViewportSize(viewport);
      // Offline-safe external images: the seed photo is a real PNG, broken.jpg is undecodable bytes.
      await page.route("https://example.com/**", (route) => route.fulfill(route.request().url().endsWith("broken.jpg")
        ? { status: 200, contentType: "image/jpeg", body: "not an image" }
        : { status: 200, contentType: "image/png", body: Buffer.from(PNG_BASE64, "base64") }));
      const res = await page.goto(`${baseUrl}/`);
      assert.equal(res.status(), 200);
      await page.waitForLoadState("networkidle");

      assert.match(await page.locator("h1").innerText(), /عطرك يحكي عنك/);
      assert.equal(await page.locator("h1").count(), 1);
      await page.locator(".card-name", { hasText: SEEDED_PRODUCT_NAME }).first().waitFor();
      assert.ok(await page.locator("#families .blotter").count() >= 1, "tester bar shows families");

      await page.locator('img[alt="عطر صورته مكسورة"]').first().scrollIntoViewIfNeeded();
      await page.waitForFunction(() =>
        document.querySelector('img[alt="عطر صورته مكسورة"]')?.src.includes("/assets/img/placeholder-bottle.svg?v="));

      const mobile = viewport.width < 900;
      assert.equal(await page.locator(".bottom-bar").isVisible(), mobile);
      assert.equal(await page.locator(".header-row > .search-field").isVisible(), !mobile);

      await page.locator(".card-add").first().click();
      await page.waitForFunction(() =>
        [...document.querySelectorAll("[data-cart-count]")].some((el) => !el.hidden && el.textContent === "1"));
      await page.evaluate(() => localStorage.removeItem("nsamat_cart_v1"));

      // A malformed stored cart never breaks the page: bad lines are dropped, the rest still counts.
      const badge = (n) => page.waitForFunction((want) =>
        [...document.querySelectorAll("[data-cart-count]")].some((el) => !el.hidden && el.textContent === want), String(n));
      for (const [stored, before] of [[JSON.stringify([null, 5, "x", { id: "a", size: "30", qty: 2 }]), 2], ["{not json", 0]]) {
        await page.evaluate((v) => localStorage.setItem("nsamat_cart_v1", v), stored);
        await page.reload();
        await page.waitForLoadState("networkidle");
        if (before) await badge(before);
        await page.locator(".card-add").first().click();
        await badge(before + 1);
      }
      await page.evaluate(() => localStorage.removeItem("nsamat_cart_v1"));

      await page.evaluate(() => scrollTo(0, document.body.scrollHeight));
      await page.waitForLoadState("networkidle");
      const [scrollWidth, innerWidth] = await page.evaluate(() => [document.documentElement.scrollWidth, window.innerWidth]);
      assert.ok(scrollWidth <= innerWidth, `horizontal scroll at ${viewport.width}px: ${scrollWidth} > ${innerWidth}`);
      assert.equal(innerWidth, viewport.width, `layout viewport widened at ${viewport.width}px`); // isMobile widens instead of scrolling
      check(page);
    }
  });

  // --- Task 5: search, collection filters, product page.
  const YSL = "إيف سان لوران ليبر";
  // 30 ml is in stock; there is no 100 ml bottle, so 100 ml is out of stock.
  const ysl = await Product.create({
    p_name: YSL, p_image: "https://example.com/seed.jpg", p_category: "Women", families: ["floral", "vanilla"],
    keywords: "YSL Libre", oil_id: "OIL1", oil_percentage: 20, alcohol_percentage: 80,
    size_list: [{ size: "30", price: 30 }, { size: "100", price: 70 }],
  });
  invalidateCatalog();
  const VIEWPORTS = [{ width: 1440, height: 900 }, { width: 375, height: 812 }];
  const storefrontPage = async (viewport) => {
    const page = await openPage({ mobile: viewport.width < 900 });
    await page.setViewportSize(viewport);
    await page.route("https://example.com/**", (route) =>
      route.fulfill({ status: 200, contentType: "image/png", body: Buffer.from(PNG_BASE64, "base64") }));
    return page;
  };
  const noHorizontalScroll = async (page, viewport) => {
    const [sw, iw] = await page.evaluate(() => [document.documentElement.scrollWidth, window.innerWidth]);
    assert.ok(sw <= iw, `horizontal scroll at ${viewport.width}px on ${page.url()}: ${sw} > ${iw}`);
    // With isMobile, overflow widens the layout viewport instead of scrolling it.
    assert.equal(iw, viewport.width, `layout viewport grew on ${page.url()}`);
  };

  await scenario("Search", async () => {
    for (const viewport of VIEWPORTS) {
      const page = await storefrontPage(viewport);
      await page.goto(`${baseUrl}/`);
      await page.waitForLoadState("networkidle");
      if (viewport.width >= 900) await page.locator(".header-row > .search-field input").click();
      else await page.locator(".header-actions [data-open-search]").click();
      const input = page.locator("#so-q");
      await input.waitFor();
      // Typed without the hamza: "ايف" must find "إيف".
      await input.pressSequentially("ايف");
      await page.locator(".so-item", { hasText: YSL }).waitFor();
      assert.equal(await page.locator(".so-item").count(), 1);
      await input.press("ArrowDown");
      assert.equal(await page.locator('.so-item[aria-selected="true"]').count(), 1);
      assert.match(await input.getAttribute("aria-activedescendant"), /^so-opt-/);
      await input.press("ArrowUp"); // back in the field: Enter goes to the full results page
      assert.equal(await page.locator('.so-item[aria-selected="true"]').count(), 0);
      await Promise.all([page.waitForURL(/\/search\?q=/), input.press("Enter")]);
      assert.equal(new URL(page.url()).searchParams.get("q"), "ايف");
      await page.locator(".grid-item:not([hidden]) .card-name", { hasText: YSL }).waitFor();
      await noHorizontalScroll(page, viewport);

      // No results: suggestions instead of a blank panel. Esc closes the overlay.
      await page.evaluate(() => document.activeElement?.blur());
      await page.keyboard.press("/");
      await input.waitFor();
      await input.fill("zzqxw");
      await page.locator("[data-so-suggest]:not([hidden]) .chip-link").first().waitFor();
      assert.match(await page.locator("[data-so-status]").innerText(), /لا نتائج/);
      await input.press("Escape");
      await page.waitForFunction(() => !document.getElementById("search-overlay").open);

      // Keyboard to a product: open, type, ArrowDown, Enter.
      await page.keyboard.press("/");
      await input.fill("libre");
      await page.locator(".so-item", { hasText: YSL }).waitFor();
      await input.press("ArrowDown");
      await Promise.all([page.waitForURL(/\/p\/[a-f0-9]{24}$/), input.press("Enter")]);
      assert.equal(await page.locator("h1").innerText(), YSL);
      check(page);
    }
  });

  await scenario("Collection filter", async () => {
    for (const viewport of VIEWPORTS) {
      const page = await storefrontPage(viewport);
      await page.goto(`${baseUrl}/c/women`);
      await page.waitForLoadState("networkidle");
      const visible = page.locator(".grid-item:not([hidden])");
      const all = await visible.count();
      assert.ok(all >= 3, `expected at least 3 women's products, got ${all}`);

      await page.locator(".toggle", { hasText: "زهري" }).click();
      await page.waitForFunction(() => document.querySelectorAll(".grid-item:not([hidden])").length === 1);
      assert.match(await visible.first().innerText(), new RegExp(YSL));
      assert.equal(new URL(page.url()).searchParams.get("f"), "floral");
      assert.equal(await page.locator("[data-count]").innerText(), "عطر واحد");

      await page.locator(".toggle", { hasText: "زهري" }).click();
      await page.waitForFunction((n) => document.querySelectorAll(".grid-item:not([hidden])").length === n, all);
      assert.equal(new URL(page.url()).search, "");

      // Sort by price, highest first: the URL is deep-linkable and the server renders the same order.
      await page.selectOption(".sort select", "price_desc");
      await page.waitForFunction(() => location.search === "?sort=price_desc");
      assert.match(await visible.first().innerText(), new RegExp(YSL));
      await page.reload();
      assert.equal(await page.locator(".sort select").inputValue(), "price_desc");
      assert.match(await visible.first().innerText(), new RegExp(YSL));

      // Filtering to nothing shows suggestions and a way back.
      await page.goto(`${baseUrl}/c/women?f=floral`);
      await page.locator(".toggle", { hasText: "المتوفر فقط" }).click();
      await page.locator(".toggle", { hasText: "100 مل" }).click();
      await page.locator("[data-empty]:not([hidden])").waitFor();
      await page.locator("[data-empty] [data-clear]").click();
      await page.waitForFunction((n) => document.querySelectorAll(".grid-item:not([hidden])").length === n, all);
      await noHorizontalScroll(page, viewport);
      check(page);
    }
  });

  await scenario("Product page", async () => {
    for (const viewport of VIEWPORTS) {
      const page = await storefrontPage(viewport);
      await page.goto(`${baseUrl}/p/${ysl._id}`);
      await page.waitForLoadState("networkidle");
      await page.evaluate(() => localStorage.removeItem("nsamat_cart_v1"));
      assert.equal(await page.locator("h1").innerText(), YSL);
      assert.equal(await page.locator(".bottom-bar").count(), 0, "product pages have their own action bar");
      assert.equal(await page.locator("[data-oos]").isVisible(), false, "the in-stock size is preselected");

      await page.locator(".size-opt", { hasText: "100 مل" }).click();
      await page.locator("[data-oos]").waitFor();
      assert.match(await page.locator("[data-oos]").innerText(), /نحضّره لك عند الطلب/);
      assert.equal(await page.locator("[data-price] .price-final").innerText(), "70.00 د.أ");

      await page.locator("[data-open-interest]").click();
      const dialog = page.locator("[data-interest-dialog]");
      await dialog.waitFor();
      assert.equal(await dialog.locator("[data-interest-size]").innerText(), "100 مل");
      await dialog.locator("[type=submit]").click();
      await dialog.locator("#i-name-err:not([hidden])").waitFor();
      assert.equal(await page.evaluate(() => document.activeElement.id), "i-name");
      await dialog.locator("#i-name").fill("سارة");
      await dialog.locator("#i-phone").fill("079 123 4567");
      await dialog.locator("[type=submit]").click();
      await dialog.locator("[data-interest-done]:not([hidden])").waitFor();
      const saved = await Interest.findOne({ product_id: ysl._id, phone: "0791234567" }).lean();
      assert.equal(saved?.size, "100");
      await dialog.locator("[data-interest-done] [data-close]").click();
      await page.waitForFunction(() => !document.querySelector("[data-interest-dialog]").open);

      await page.locator("[data-pdp-add]").click();
      await page.waitForFunction(() =>
        [...document.querySelectorAll("[data-cart-count]")].some((el) => !el.hidden && el.textContent === "1"));
      const cart = await page.evaluate(() => JSON.parse(localStorage.getItem("nsamat_cart_v1")));
      assert.deepEqual(cart, [{ id: String(ysl._id), size: "100", qty: 1 }]);
      await noHorizontalScroll(page, viewport);

      // Recently viewed shows up on the next product page.
      await page.goto(`${baseUrl}/p/${seeded._id}`);
      await page.locator("[data-recent]:not([hidden]) .card-name", { hasText: YSL }).waitFor();
      await page.evaluate(() => { localStorage.removeItem("nsamat_cart_v1"); localStorage.removeItem("nsamat_recent_v1"); });
      check(page);
    }
  });

  await registerAllScenarios({
    scenario, openPage, use3d, check, baseUrl, admin: { username: ADMIN_USER, password: ADMIN_PASS },
    png: Buffer.from(PNG_BASE64, "base64"), pngPath, productId: String(seeded._id), fxProductId: String(ysl._id),
  });
}

try {
  await run();
} finally {
  await fs.rm(pngPath, { force: true }).catch(() => {});
  await browser?.close().catch(() => {});
  await browser3d?.close().catch(() => {});
  await mongoose.connection.dropDatabase().catch(() => {});
  await mongoose.disconnect().catch(() => {});
  await new Promise((r) => (server ? server.close(r) : r()));
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} scenarios passed`);
if (process.env.E2E_ONLY && results.length === 0) {
  console.error(`E2E_ONLY=${process.env.E2E_ONLY} matched no scenario`);
  process.exit(1);
}
if (failed.length) process.exit(1);
