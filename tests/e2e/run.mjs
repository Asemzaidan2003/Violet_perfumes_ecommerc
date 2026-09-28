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
import { registerAdminOnlineScenarios } from "./admin-online.mjs";
import { registerCheckoutScenarios } from "./checkout.mjs";
import { registerPromotionScenarios } from "./promotions.mjs";
import { registerFxScenarios } from "./fx.mjs";

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
const MOBILE = { viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true };
async function use3d() {
  browser3d = await chromium.launch({ channel: "msedge", headless: true, args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
  [context, mobileContext] = [await browser3d.newContext(), await browser3d.newContext(MOBILE)];
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

// Playwright's own response.json()/.text() (CDP Network.getResponseBody) hangs
// indefinitely on this msedge/headless setup when read for a fetch() response
// on a page that shortly after shows a blocking alert() and reloads — confirmed
// by isolated repro (see task-5-report.md). Workaround: capture bodies in-page
// via a wrapped window.fetch, persisted to sessionStorage (survives the reload,
// unlike a plain JS variable), and poll for them from Node instead.
async function installFetchCapture(ctx) {
  await ctx.addInitScript(() => {
    const orig = window.fetch;
    window.fetch = async (...args) => {
      const res = await orig(...args);
      res.clone().text().then((body) => {
        try {
          const key = `e2e:${args[1]?.method || "GET"}:${String(args[0])}`;
          sessionStorage.setItem(key, JSON.stringify({ status: res.status, body }));
        } catch { /* sessionStorage unavailable (opaque origin etc.) — not expected here */ }
      }).catch(() => {});
      return res;
    };
  });
}

async function readCaptured(page, method, url, { retries = 50, intervalMs = 200 } = {}) {
  const key = `e2e:${method}:${url}`;
  for (let i = 0; i < retries; i++) {
    let raw = null;
    try { raw = await page.evaluate((k) => sessionStorage.getItem(k), key); }
    catch { /* navigation mid-poll destroyed the execution context; retry */ }
    if (raw) return JSON.parse(raw);
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  throw new Error(`timed out waiting for captured ${method} ${url} response`);
}

async function scenario(name, fn) {
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
  context = await browser.newContext();
  mobileContext = await browser.newContext({ viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true });
  await installFetchCapture(context);

  let addedProductId;

  await scenario("Admin login", async () => {
    const page = await openPage();
    await page.goto(`${baseUrl}/admin/html/login.html`);
    await page.fill("#username", ADMIN_USER);
    await page.fill("#password", ADMIN_PASS);
    await Promise.all([page.waitForURL(/index\.html/), page.click("#loginForm button[type=submit]")]);
    check(page);
  });

  await scenario("Add product with an uploaded photo", async () => {
    const page = await openPage();
    await page.goto(`${baseUrl}/admin/html/add_product.html`);
    await page.evaluate(() => window.productFields.ready);

    await page.setInputFiles("#p_image_file", pngPath);
    await page.waitForFunction(() => /^\/img\//.test(document.getElementById("p_image").value));

    await page.fill("#p_name", "عطر اختبار الصور");
    await page.selectOption("#p_category", "Women");
    await page.evaluate(() => { document.getElementById("oil_id").value = "OIL1"; });
    await page.fill("#oil_percentage", "20");
    await page.fill("#alcohol_percentage", "80");

    await page.click(".btn.btn-secondary.btn-sm"); // "+ إضافة حجم"
    await page.fill(".size-entry input[name=size]", "30");
    await page.fill(".size-entry input[name=price]", "25");

    await page.check("input[name=families][value=oud]");
    await page.check("input[name=families][value=amber]");
    await page.fill("#notes_base", "عود");

    await page.click("#productForm button[type=submit]");
    const captured = await readCaptured(page, "POST", "/api/products");
    assert.equal(captured.status, 201, `create failed: ${captured.body}`);
    const created = JSON.parse(captured.body).data;
    addedProductId = created._id;

    const fetched = await page.evaluate(async (id) => {
      const res = await fetch("/api/products");
      return (await res.json()).data.find((p) => p._id === id);
    }, addedProductId);

    assert.equal(fetched.p_category, "Women");
    assert.deepEqual(fetched.families, ["oud", "amber"]);
    assert.match(fetched.p_image, /^\/img\//);
    const imgStatus = await page.evaluate(async (url) => (await fetch(url)).status, fetched.p_image);
    assert.equal(imgStatus, 200);
    check(page);
  });

  await scenario("Edit product keeps and changes fields", async () => {
    const page = await openPage();
    await page.goto(`${baseUrl}/admin/html/edit_product.html?id=${addedProductId}`);
    await page.waitForFunction(() => {
      const checked = [...document.querySelectorAll("input[name=families]:checked")].map((i) => i.value);
      return checked.includes("oud") && checked.includes("amber");
    });

    assert.equal(await page.inputValue("#p_category"), "Women");
    assert.equal(await page.isChecked("input[name=families][value=oud]"), true);
    assert.equal(await page.isChecked("input[name=families][value=amber]"), true);

    await page.uncheck("input[name=families][value=amber]");
    const responsePromise = page.waitForResponse(
      (r) => r.url().endsWith(`/api/products/${addedProductId}`) && r.request().method() === "PUT"
    );
    await page.click("#editProductForm button[type=submit]");
    await responsePromise;
    await page.waitForURL(/all_products\.html/);

    const fetched = await page.evaluate(async (id) => {
      const res = await fetch(`/api/products/${id}`);
      return (await res.json()).data;
    }, addedProductId);
    assert.deepEqual(fetched.families, ["oud"]);
    assert.equal(fetched.p_category, "Women");
    check(page);
  });

  await scenario("Bulk tagging on catalog page", async () => {
    const page = await openPage();
    await page.goto(`${baseUrl}/admin/html/catalog.html`);
    await page.waitForSelector("#catalogBody tr:not(.loading-row)");

    const row = page.locator("#catalogBody tr", { hasText: SEEDED_PRODUCT_NAME });
    await row.locator("select").selectOption("Unisex");
    await row.locator("input[type=checkbox][value=musk]").check();
    await row.locator("button", { hasText: "حفظ" }).click();
    await row.locator("text=تم الحفظ").waitFor();

    const fetched = await page.evaluate(async (id) => {
      const res = await fetch(`/api/products/${id}`);
      return (await res.json()).data;
    }, seeded._id.toString());
    assert.equal(fetched.p_category, "Unisex");
    assert.ok(fetched.families.includes("musk"));
    check(page);
  });

  await scenario("No console/CSP errors on catalogue admin pages", async () => {
    const pages = ["all_products.html", "add_product.html", `edit_product.html?id=${addedProductId}`, "catalog.html"];
    for (const p of pages) {
      const page = await openPage();
      await page.goto(`${baseUrl}/admin/html/${p}`);
      await page.waitForLoadState("networkidle");
      check(page);
    }
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

  // Task 6 (cart drawer, checkout, confirmation) — see checkout.mjs.
  await registerCheckoutScenarios({ scenario, openPage, check, baseUrl, png: Buffer.from(PNG_BASE64, "base64"), admin: { username: ADMIN_USER, password: ADMIN_PASS } });

  // Task 7 (admin interests/settings/online-order pages) — see admin-online.mjs.
  await registerAdminOnlineScenarios({ scenario, openPage, check, baseUrl });
  await registerPromotionScenarios({
    scenario, openPage, check, baseUrl, shotDir: process.env.E2E_SHOT_DIR || os.tmpdir(),
    admin: { username: ADMIN_USER, password: ADMIN_PASS },
  });

  // Task 1 (immersive layer: capability gate, reveals, view transitions) — see fx.mjs.
  await registerFxScenarios({ scenario, openPage, use3d, check, baseUrl, productId: String(ysl._id) });
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
if (failed.length) process.exit(1);
