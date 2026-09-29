// New React admin POS. registerAdminPosScenarios({ scenario, openPage, check, baseUrl, admin })
import assert from "node:assert/strict";
import Bottle from "../../backend/models/bottle.model.js";
import Customer from "../../backend/models/customer.model.js";
import Order from "../../backend/models/order.model.js";
import Product from "../../backend/models/product.model.js";
import { invalidateCatalog } from "../../backend/store/catalog.js";

const NAME = "عطر اختبار الكاشير";
const XSS_NAME = "<img src=x onerror=window.__xss=1>";

// Logs in through the API (the cookie lands in the page's browser context) and opens the POS. Going
// through the login form instead would log a 401 from the first /api/auth/me probe, which the
// harness's check() counts as console noise.
async function openPos(page, baseUrl, admin) {
  const res = await page.request.post(`${baseUrl}/api/auth/login`, { data: { username: admin.username, password: admin.password } });
  assert.equal(res.status(), 200);
  await page.goto(`${baseUrl}/admin/`);
  await page.waitForURL(/\/admin\/pos$/);
}

const noSideScroll = (page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);

export async function registerAdminPosScenarios({ scenario, openPage, check, baseUrl, admin }) {
  await scenario("New admin login: a wrong password shows an inline error, the right one lands on the POS", async () => {
    const page = await openPage();
    // The browser context is shared with earlier scenarios that left an admin session cookie behind.
    await page.context().clearCookies();
    await page.goto(`${baseUrl}/admin/`);
    await page.waitForURL(/\/admin\/login$/);
    await page.fill("#username", admin.username);
    await page.fill("#password", "definitely-wrong");
    await page.click("button[type=submit]");
    await page.getByRole("alert").waitFor();
    assert.match(page.url(), /\/admin\/login$/);
    await page.fill("#password", admin.password);
    await page.click("button[type=submit]");
    await page.waitForURL(/\/admin\/pos$/);
    // The two 401s above (auth probe, wrong password) are expected; anything else is not.
    assert.deepEqual(page.errors.filter((e) => !/status of 401/.test(e)), []);
  });

  await scenario("New admin POS on desktop: sell a product to a new customer, shortage-free, one order only", async () => {
    await Bottle.create({ name: "زجاجة كاشير 30", capacity: 30, cost: 0.2, quantity: 50 });
    const product = await Product.create({
      p_name: NAME, p_image: ".", p_category: "Men", oil_id: "OIL1", oil_percentage: 20, alcohol_percentage: 80,
      size_list: [{ size: "30", price: 25 }],
    });
    invalidateCatalog();
    const before = await Order.countDocuments({ source: "pos" });

    const page = await openPage();
    await page.setViewportSize({ width: 1440, height: 900 });
    await openPos(page, baseUrl, admin);
    await page.getByRole("button", { name: `أضف ${NAME}` }).click();

    const cart = page.getByRole("list", { name: "عناصر السلة" });
    await cart.waitFor();
    assert.equal(await page.getByLabel(`زجاجة ${NAME} 30 مل`).inputValue() !== "", true, "the only fitting bottle is preselected");
    await page.getByRole("button", { name: "زيادة الكمية" }).click();
    assert.equal(await page.getByLabel("الإجمالي").textContent(), "50.00 JOD");

    await page.getByRole("button", { name: "زبون جديد" }).click();
    await page.fill("#new-customer-name", "زبون كاشير");
    await page.fill("#new-customer-phone", "٠٧٩٩٠٠١١٢٢");

    const done = page.getByRole("button", { name: "إتمام البيع" });
    let posts = 0;
    page.on("request", (r) => { if (r.url().endsWith("/api/orders") && r.method() === "POST") posts += 1; });
    await Promise.all([
      page.waitForResponse((r) => r.url().endsWith("/api/orders") && r.request().method() === "POST" && r.status() === 201),
      done.dblclick(),
    ]);
    await page.getByText("تم إنشاء الطلب").waitFor();
    await page.waitForTimeout(500); // let a second, racing POST (a double-submit regression) land before counting
    assert.equal(posts, 1, "double-submit: a double tap must send exactly one POST /api/orders");
    assert.equal(await Order.countDocuments({ source: "pos" }), before + 1, "double-submit: a double tap must create exactly one order");
    const customer = await Customer.findOne({ phone: "0799001122" });
    assert.ok(customer, "phone typed in Arabic digits is stored normalised");
    const order = await Order.findOne({ source: "pos" }).sort({ createdAt: -1 });
    assert.equal(order.final_total, 50);
    assert.equal(String(order.customer_id), String(customer._id));

    await page.getByRole("button", { name: "بيع جديد" }).click();
    await page.getByText("السلة فارغة — اضغط على منتج لإضافته").waitFor();
    assert.equal(await noSideScroll(page), true);
    check(page);
    await Product.deleteOne({ _id: product._id });
    invalidateCatalog();
  });

  await scenario("New admin POS at 375px: cart bar and sheet, no sideways scroll, names render as text", async () => {
    await Bottle.updateOne({ capacity: 30 }, { $setOnInsert: { name: "زجاجة كاشير 30", cost: 0.2, quantity: 50 } }, { upsert: true });
    const product = await Product.create({
      p_name: XSS_NAME, p_image: ".", p_category: "Men", oil_id: "OIL1", oil_percentage: 20, alcohol_percentage: 80,
      size_list: [{ size: "30", price: 25 }],
    });
    invalidateCatalog();

    const page = await openPage({ mobile: true });
    await openPos(page, baseUrl, admin);
    assert.equal(await noSideScroll(page), true, "no sideways scroll on the catalogue");
    await page.getByRole("button", { name: `أضف ${XSS_NAME}` }).click();
    assert.equal(await page.evaluate(() => window.__xss), undefined, "product names are text, never HTML");

    const bar = page.getByRole("button", { name: /فتح السلة/ });
    await bar.waitFor();
    const box = await bar.boundingBox();
    assert.ok(box.height >= 44, "cart bar is a comfortable touch target");
    await bar.click();
    await page.getByRole("list", { name: "عناصر السلة" }).waitFor();
    assert.equal(await noSideScroll(page), true, "no sideways scroll with the cart open");
    for (const name of [/زيادة الكمية/, /حذف/]) {
      const b = await page.getByRole("button", { name }).first().boundingBox();
      assert.ok(b.width >= 44 && b.height >= 44, `${name} is at least 44px`);
    }
    check(page);
    await Product.deleteOne({ _id: product._id });
    invalidateCatalog();
  });
}
