// Real-browser e2e harness: drives the Microsoft Edge already installed on this
// machine (via playwright-core, channel "msedge", no browser download) against
// the app on its own throwaway local DB. Run: npm run test:e2e
//
// Later sub-projects add scenarios to this file — call scenario(name, fn) in
// sequence below; each fn gets a fresh page via openPage() and should end with
// check(page) to fail on any console/pageerror/CSP noise.
import assert from "node:assert/strict";
import crypto from "node:crypto";
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

process.env.SESSION_SECRET ||= "e2e-secret-".padEnd(48, "x");

const ADMIN_USER = "admin";
const ADMIN_PASS = "e2e-pass-123";
const SEEDED_PRODUCT_NAME = "منتج مصدر تجريبي";
// 1x1 transparent PNG — same bytes tests/uploads.test.js uses.
const PNG_BASE64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

const dbName = `nsamat_e2e_${process.pid}`;
const uri = `mongodb://127.0.0.1:27017/${dbName}?replicaSet=rs0`;
const pngPath = path.join(os.tmpdir(), `nsamat-e2e-${process.pid}.png`);

let server, browser, context;
const results = [];

async function openPage() {
  const page = await context.newPage();
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

  browser = await chromium.launch({ channel: "msedge", headless: true });
  context = await browser.newContext();
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
      const page = await openPage();
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
      check(page);
    }
  });

  // Places an online order directly against the public API (server-to-server — the storefront
  // checkout UI itself is exercised by an earlier task's own scenario). Used by the two
  // admin-side scenarios below.
  async function placeOnlineOrder({ productId, size, name, phone, city, address, notes }) {
    const res = await fetch(`${baseUrl}/api/store/orders`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        items: [{ product_id: productId, size, quantity: 1 }],
        customer: { name, phone, city, address, notes },
        client_key: crypto.randomUUID(),
      }),
    });
    const body = await res.json().catch(() => null);
    assert.equal(res.status, 201, `order placement failed: ${JSON.stringify(body)}`);
    return body.data;
  }

  async function findOrderIdByRef(page, ref) {
    const id = await page.evaluate(async (r) => {
      const res = await fetch("/api/orders");
      const { data } = await res.json();
      return data.find((o) => o.public_ref === r)?._id;
    }, ref);
    assert.ok(id, `no order found for ref ${ref}`);
    return id;
  }

  await scenario("Settings round trip", async () => {
    const page = await openPage();
    await page.goto(`${baseUrl}/admin/html/settings.html`);
    await page.waitForLoadState("networkidle");
    assert.equal(await page.inputValue("#delivery_fee"), "0"); // defaults — nothing has saved settings yet

    await page.fill("#whatsapp", "962791234567");
    await page.fill("#instagram", "https://instagram.com/nsamat");
    await page.fill("#delivery_fee", "3");
    await page.fill("#free_delivery_over", "0");
    const saved = page.waitForResponse((r) => r.url().endsWith("/api/settings") && r.request().method() === "PUT");
    await page.click("#settingsForm button[type=submit]");
    assert.equal((await saved).status(), 200);
    await page.locator("#success:not([hidden])").waitFor();
    check(page);

    await page.reload();
    await page.waitForLoadState("networkidle");
    assert.equal(await page.inputValue("#whatsapp"), "962791234567");
    assert.equal(await page.inputValue("#instagram"), "https://instagram.com/nsamat");
    assert.equal(await page.inputValue("#delivery_fee"), "3");
    assert.equal(await page.inputValue("#free_delivery_over"), "0");

    // Inline server error: an invalid value is rejected without crashing the page. (A negative
    // delivery_fee can't be used here — the number input's own min="0" blocks submission client-side.)
    // A fresh page, because Edge itself logs a devtools "Failed to load resource" console entry for
    // any non-2xx fetch response — expected noise here, not checked by check().
    const errorPage = await openPage();
    await errorPage.goto(`${baseUrl}/admin/html/settings.html`);
    await errorPage.waitForLoadState("networkidle");
    await errorPage.fill("#whatsapp", "not-a-number");
    const rejected = errorPage.waitForResponse((r) => r.url().endsWith("/api/settings") && r.request().method() === "PUT");
    await errorPage.click("#settingsForm button[type=submit]");
    assert.equal((await rejected).status(), 400);
    await errorPage.locator("#error:not([hidden])").waitFor();
  });

  await scenario("Admin sees the online order", async () => {
    const onlineProduct = await Product.create({
      p_name: "عطر طلب أونلاين", p_image: "https://example.com/online.jpg", p_category: "Men",
      oil_id: "OIL1", oil_percentage: 20, alcohol_percentage: 80, size_list: [{ size: "30", price: 22 }],
    });

    const placed = await placeOnlineOrder({
      productId: onlineProduct._id.toString(), size: "30", name: "زبون الموقع", phone: "0791234567",
      city: "عمّان", address: "شارع الجامعة 12", notes: "الرجاء الاتصال قبل التوصيل",
    });
    assert.equal(placed.delivery_fee, 3, "should use the delivery fee saved in the previous scenario");

    const ordersPage = await openPage();
    await ordersPage.goto(`${baseUrl}/admin/html/orders.html`);
    await ordersPage.waitForLoadState("networkidle");
    assert.equal(await ordersPage.locator("#navOrdersBadge").innerText(), "1");
    assert.match(await ordersPage.title(), /^\(1\) /);
    await ordersPage.locator("td.cell-strong", { hasText: "زبون الموقع" }).first().waitFor();
    await ordersPage.locator("span.badge", { hasText: "الموقع" }).first().waitFor();

    const orderId = await findOrderIdByRef(ordersPage, placed.ref);
    check(ordersPage);

    const detailsPage = await openPage();
    await detailsPage.goto(`${baseUrl}/admin/html/order-details.html?id=${orderId}`);
    await detailsPage.waitForSelector("#deliveryInfo");
    const deliveryText = await detailsPage.locator("#deliveryInfo").innerText();
    assert.match(deliveryText, /زبون الموقع/);
    assert.match(deliveryText, /عمّان/);
    assert.match(deliveryText, /شارع الجامعة 12/);
    assert.equal(await detailsPage.inputValue("#deliveryFeeInput"), "3");

    await detailsPage.selectOption("#bottle-0", { index: 1 }); // the seeded "زجاجة 30 مل" — only match for this size
    const confirmed = detailsPage.waitForResponse(
      (r) => r.url().endsWith(`/orders/${orderId}/confirm`) && r.request().method() === "POST"
    );
    await detailsPage.click("#confirmBtn");
    assert.equal((await confirmed).status(), 200);
    await detailsPage.locator("text=تم الخصم").waitFor();
    check(detailsPage);

    const stored = await detailsPage.evaluate(async (id) => {
      const res = await fetch(`/api/orders/${id}`);
      return (await res.json()).data;
    }, orderId);
    assert.equal(stored.stock_deducted, true);
    assert.ok(stored.customer_id, "confirming an online order should link/create a customer");
  });

  await scenario("XSS inert", async () => {
    const xssProduct = await Product.create({
      p_name: "عطر اختبار XSS", p_image: "https://example.com/xss.jpg", p_category: "Men",
      oil_id: "OIL1", oil_percentage: 20, alcohol_percentage: 80, size_list: [{ size: "30", price: 15 }],
    });

    const placed = await placeOnlineOrder({
      productId: xssProduct._id.toString(), size: "30", name: "<img src=x onerror=window.__xss=1>",
      phone: "0781234567", city: "إربد", address: "شارع الاختبار 5", notes: "ملاحظة",
    });

    const ordersPage = await openPage();
    await ordersPage.goto(`${baseUrl}/admin/html/orders.html`);
    await ordersPage.waitForLoadState("networkidle");
    assert.equal(await ordersPage.evaluate(() => window.__xss), undefined);
    const orderId = await findOrderIdByRef(ordersPage, placed.ref);
    check(ordersPage);

    const detailsPage = await openPage();
    await detailsPage.goto(`${baseUrl}/admin/html/order-details.html?id=${orderId}`);
    await detailsPage.waitForLoadState("networkidle");
    assert.equal(await detailsPage.evaluate(() => window.__xss), undefined);
    check(detailsPage);
  });
}

try {
  await run();
} finally {
  await fs.rm(pngPath, { force: true }).catch(() => {});
  await browser?.close().catch(() => {});
  await mongoose.connection.dropDatabase().catch(() => {});
  await mongoose.disconnect().catch(() => {});
  await new Promise((r) => (server ? server.close(r) : r()));
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} scenarios passed`);
if (failed.length) process.exit(1);
