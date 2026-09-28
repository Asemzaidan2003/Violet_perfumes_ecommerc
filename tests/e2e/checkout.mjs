// Task 6 storefront purchase scenarios (cart drawer, checkout, confirmation), in their own module
// so run.mjs stays small. Call registerCheckoutScenarios({...}) from run.mjs after the server is up.
// Order-independent: the scenario seeds its own product, sets the shop settings it needs and
// restores the previous ones, clears the cart first, and never assumes global order counts.
import assert from "node:assert/strict";
import Order from "../../backend/models/order.model.js";
import Product from "../../backend/models/product.model.js";
import Coupon from "../../backend/models/coupon.model.js";
import { invalidateCatalog } from "../../backend/store/catalog.js";
import { getSettings, saveSettings } from "../../backend/services/settings.service.js";

const VIEWPORTS = [{ width: 1440, height: 900 }, { width: 375, height: 812 }];
const NAME = "عطر الشراء الكامل";
const ORDER_URL = /\/order\/[A-Z2-9]{10}$/;
const ORDERS_API = "/api/store/orders";

export async function registerCheckoutScenarios({ scenario, openPage, check, baseUrl, png, admin }) {
  const product = await Product.create({
    p_name: NAME, p_image: "https://example.com/seed.jpg", p_category: "Men",
    oil_id: "OIL1", oil_percentage: 20, alcohol_percentage: 80, size_list: [{ size: "30", price: 25 }],
  });
  const pid = String(product._id);
  invalidateCatalog();
  const previous = await getSettings();
  await saveSettings({ whatsapp: "962790000000", delivery_fee: 2, free_delivery_over: 100 });

  const shopPage = async (viewport) => {
    const page = await openPage({ mobile: viewport.width < 900 });
    await page.setViewportSize(viewport);
    await page.route("https://example.com/**", (route) => route.fulfill({ status: 200, contentType: "image/png", body: png }));
    return page;
  };
  const noHorizontalScroll = async (page, viewport) => {
    const [sw, iw] = await page.evaluate(() => [document.documentElement.scrollWidth, window.innerWidth]);
    assert.ok(sw <= iw, `horizontal scroll at ${viewport.width}px on ${page.url()}: ${sw} > ${iw}`);
    assert.equal(iw, viewport.width, `layout viewport grew on ${page.url()}`);
  };
  const storedCart = (page) => page.evaluate(() => JSON.parse(localStorage.getItem("nsamat_cart_v1") || "[]"));
  const text = (page, sel) => page.locator(sel).first().innerText();
  const fillCheckout = async (page, name) => {
    await page.fill("#co-name", name);
    await page.fill("#co-phone", "٠٧٩١٢٣٤٥٦٧");
    await page.selectOption("#co-city", "الزرقاء");
    await page.fill("#co-address", "حي معصوم، شارع الملك عبدالله 5");
  };
  // The admin orders API, through the logged-in desktop context (logs in if it isn't).
  const adminOrders = async () => {
    const page = await openPage();
    await page.goto(`${baseUrl}/admin/html/login.html`);
    return page.evaluate(async ({ username, password }) => {
      let res = await fetch("/api/orders");
      if (res.status === 401) {
        await fetch("/api/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ username, password }) });
        res = await fetch("/api/orders");
      }
      return (await res.json()).data;
    }, admin);
  };

  try {
    await scenario("Full purchase", async () => {
      for (const viewport of VIEWPORTS) {
        const page = await shopPage(viewport);
        await page.goto(`${baseUrl}/`);
        await page.evaluate(() => ["nsamat_cart_v1", "nsamat_customer_v1"].forEach((k) => localStorage.removeItem(k)));
        await page.reload();
        await page.waitForLoadState("networkidle");

        // Card quick-add: exactly one bottle (cart.js is the only handler), and the drawer opens on it.
        await page.locator(`.card-add[data-id="${pid}"]`).first().click();
        const drawer = page.locator("#cart-drawer");
        await drawer.locator(".cart-line", { hasText: NAME }).waitFor();
        assert.deepEqual(await storedCart(page), [{ id: pid, size: "30", qty: 1 }]);
        await drawer.locator("[data-close-cart]").click();
        await page.waitForFunction(() => !document.getElementById("cart-drawer").open);

        // Product page: add again, the drawer shows the merged line with prices and delivery.
        await Promise.all([page.waitForURL(new RegExp(`/p/${pid}$`)), page.locator(`.card-link[href="/p/${pid}"]`).first().click()]);
        await page.locator("[data-pdp-add]").click();
        await drawer.locator(".cl-qty", { hasText: "2" }).waitFor();
        assert.equal(await drawer.locator(".cart-line").count(), 1);
        assert.equal(await text(page, "[data-cart-subtotal]"), "50.00 د.أ");
        assert.equal(await text(page, "[data-cart-delivery]"), "2.00 د.أ");
        assert.equal(await text(page, "[data-cart-total]"), "52.00 د.أ");
        assert.equal(await text(page, "[data-free-text]"), "باقي 50.00 د.أ للتوصيل المجاني");
        await drawer.locator('[data-cart-step="-1"]').click();
        await drawer.locator("[data-cart-total]", { hasText: "27.00 د.أ" }).waitFor();
        assert.deepEqual(await storedCart(page), [{ id: pid, size: "30", qty: 1 }]);
        await noHorizontalScroll(page, viewport);

        await Promise.all([page.waitForURL(/\/checkout$/), drawer.locator("[data-checkout-link]").click()]);
        assert.equal(await page.locator(".bottom-bar").count(), 0);
        await page.locator("[data-co-total-foot]", { hasText: "27.00 د.أ" }).waitFor();

        // Submitting empty: inline errors, an error summary, focus on the first field, no request.
        let posts = 0;
        page.on("request", (r) => { if (r.method() === "POST" && r.url().endsWith(ORDERS_API)) posts++; });
        await page.locator("[data-co-send]").click();
        await page.locator("[data-co-errors]:not([hidden])").waitFor();
        assert.equal(await page.locator("[data-co-error-list] li").count(), 4);
        for (const id of ["co-name", "co-phone", "co-city", "co-address"]) {
          assert.equal(await page.locator(`#${id}-err`).isVisible(), true, `${id} shows its error`);
          assert.equal(await page.getAttribute(`#${id}`, "aria-invalid"), "true");
        }
        assert.equal(await page.evaluate(() => document.activeElement.id), "co-name");
        assert.equal(posts, 0);
        await noHorizontalScroll(page, viewport);

        const buyer = `ليلى ${viewport.width}`;
        await fillCheckout(page, buyer);
        await page.locator("#co-address").blur();
        assert.equal(await page.locator("[data-co-errors]").isHidden(), true, "the summary clears as fields are fixed");
        await Promise.all([page.waitForURL(ORDER_URL), page.locator("[data-co-send]").click()]);

        // Confirmation: NS- ref, totals, WhatsApp follow-up, no delivery details; the cart is empty.
        const ref = page.url().split("/").pop();
        assert.match(await page.locator("h1").innerText(), /شكرًا/);
        assert.equal(await text(page, ".order-ref bdi"), `NS-${ref}`);
        assert.match(await page.locator("main .totals-grand").innerText(), /27\.00 د\.أ/);
        assert.match(decodeURIComponent(await page.locator('a[href^="https://wa.me/"]').first().getAttribute("href")), new RegExp(`NS-${ref}`));
        const body = await page.locator("main").innerText();
        assert.ok(!body.includes(buyer) && !body.includes("0791234567") && !body.includes("معصوم"), "no delivery details");
        assert.deepEqual(await storedCart(page), []);
        assert.equal(await page.locator("[data-cart-count]:not([hidden])").count(), 0);
        assert.equal(posts, 1);
        await noHorizontalScroll(page, viewport);

        const order = (await adminOrders()).find((o) => o.public_ref === ref);
        assert.ok(order, `admin API has order ${ref}`);
        assert.equal(order.source, "online");
        assert.equal(order.stock_deducted, false, "online orders wait for the admin's confirmation");
        assert.deepEqual({ ...order.delivery, _id: undefined }, {
          _id: undefined, name: buyer, phone: "0791234567", city: "الزرقاء", address: "حي معصوم، شارع الملك عبدالله 5", notes: "",
        });
        assert.equal(order.delivery_fee, 2);
        assert.equal(order.final_total, 27);

        // Remembered details prefill the next checkout.
        await page.evaluate((id) => localStorage.setItem("nsamat_cart_v1", JSON.stringify([{ id, size: "30", qty: 1 }])), pid);
        await page.goto(`${baseUrl}/checkout`);
        assert.equal(await page.inputValue("#co-name"), buyer);
        assert.equal(await page.inputValue("#co-city"), "الزرقاء");

        // Unchecking "تذكّر معلوماتي" clears the saved details right away, not only on next order.
        assert.notEqual(await page.evaluate(() => localStorage.getItem("nsamat_customer_v1")), null);
        await page.locator(".co-remember input").uncheck();
        assert.equal(await page.evaluate(() => localStorage.getItem("nsamat_customer_v1")), null);

        await page.evaluate(() => localStorage.removeItem("nsamat_cart_v1"));
        check(page);
      }
    });

    await scenario("Double submit", async () => {
      const page = await shopPage(VIEWPORTS[1]);
      await page.goto(`${baseUrl}/`);
      await page.evaluate((id) => localStorage.setItem("nsamat_cart_v1", JSON.stringify([{ id, size: "30", qty: 3 }])), pid);
      await page.goto(`${baseUrl}/checkout`);
      await page.locator("[data-co-total-foot]", { hasText: "77.00 د.أ" }).waitFor();
      const buyer = `زبون مكرر ${Date.now()}`;
      await fillCheckout(page, buyer);
      const keys = [];
      page.on("request", (r) => { if (r.method() === "POST" && r.url().endsWith(ORDERS_API)) keys.push(r.postDataJSON().client_key); });

      // Rate limited: the server's message plus a WhatsApp fallback carrying the order.
      await page.route(`**${ORDERS_API}`, (r) => r.fulfill({ status: 429, contentType: "application/json",
        body: JSON.stringify({ success: false, message: "طلبات كثيرة من نفس الجهاز" }) }), { times: 1 });
      await page.locator("[data-co-send]").click();
      await page.locator("[data-co-error]:not([hidden])", { hasText: "طلبات كثيرة" }).waitFor();
      assert.match(decodeURIComponent(await page.getAttribute("[data-co-wa]", "href")), new RegExp(NAME));

      // Network failure: the form stays, the button offers a retry with the same key.
      await page.route(`**${ORDERS_API}`, (r) => r.abort("internetdisconnected"), { times: 1 });
      await page.locator("[data-co-send]").click();
      await page.locator("[data-co-error]:not([hidden])", { hasText: "تعذّر الاتصال" }).waitFor();
      assert.equal(await page.locator("[data-co-send]").innerText(), "أعد المحاولة");
      assert.equal(await page.inputValue("#co-name"), buyer);

      // Two fast clicks and a programmatic submit: one request, one order.
      await Promise.all([page.waitForURL(ORDER_URL), page.evaluate(() => {
        const btn = document.querySelector("[data-co-send]");
        btn.click();
        btn.click();
        document.querySelector("[data-checkout]").requestSubmit();
      })]);
      assert.equal(keys.length, 3, `expected 3 POSTs (429, failed, sent), got ${keys.length}`);
      assert.equal(new Set(keys).size, 1, "every attempt reuses one client_key");
      assert.equal(await Order.countDocuments({ "delivery.name": buyer }), 1);
      // Edge logs a "Failed to load resource" console error for the 429 and the aborted request.
      page.errors.splice(0, Infinity, ...page.errors.filter((e) => !/Failed to load resource/.test(e)));
      check(page);
    });

    await scenario("Coupon checkout", async () => {
      const coupon = await Coupon.create({ code: "SAVE10", type: "percent", value: 10, active: true });
      try {
        const page = await shopPage(VIEWPORTS[1]);
        await page.goto(`${baseUrl}/`);
        await page.evaluate((id) => localStorage.setItem("nsamat_cart_v1", JSON.stringify([{ id, size: "30", qty: 1 }])), pid);
        await page.goto(`${baseUrl}/checkout`);
        await page.locator("[data-co-total-foot]", { hasText: "27.00 د.أ" }).waitFor();
        await page.locator("[data-co-details] summary").click(); // open the order summary (mobile: collapsed by default)

        // A lowercase, space-padded code still works, and the discount shows in the summary and the
        // sticky mobile bar total (25.00 subtotal - 2.50 discount + 2.00 delivery = 24.50).
        await page.locator("[data-co-coupon] summary").click();
        await page.fill("#co-coupon-code", " save10 ");
        await page.click("[data-co-coupon-apply]");
        await page.locator("[data-co-discount-row]:not([hidden])").waitFor();
        assert.equal(await text(page, "[data-co-discount]"), "−2.50 د.أ");
        assert.match(await text(page, "[data-co-discount-code]"), /save10/i);
        await page.locator("[data-co-total-foot]", { hasText: "24.50 د.أ" }).waitFor();

        const buyer = `زبون الكود ${Date.now()}`;
        await fillCheckout(page, buyer);
        await Promise.all([page.waitForURL(ORDER_URL), page.locator("[data-co-send]").click()]);

        // Confirmation shows the discount row, and the admin order has discount > 0.
        assert.match(await page.locator("main .totals").innerText(), /الخصم.*SAVE10/s);
        const ref = page.url().split("/").pop();
        const order = (await adminOrders()).find((o) => o.public_ref === ref);
        assert.ok(order, `admin API has order ${ref}`);
        assert.ok(order.discount > 0, "order has a discount");
        assert.equal(order.coupon.code, "SAVE10");

        // An unknown code: the generic message shows, and no discount row appears.
        await page.evaluate((id) => localStorage.setItem("nsamat_cart_v1", JSON.stringify([{ id, size: "30", qty: 1 }])), pid);
        await page.goto(`${baseUrl}/checkout`);
        await page.locator("[data-co-coupon] summary").click();
        await page.fill("#co-coupon-code", "NOPE");
        await page.click("[data-co-coupon-apply]");
        await page.locator("[data-co-coupon-msg]", { hasText: "غير صالح" }).waitFor();
        assert.equal(await page.locator("[data-co-discount-row]:not([hidden])").count(), 0);

        await page.evaluate(() => localStorage.removeItem("nsamat_cart_v1"));
        check(page);
      } finally {
        await Coupon.deleteOne({ _id: coupon._id });
      }
    });
  } finally {
    await saveSettings(previous);
  }
}
