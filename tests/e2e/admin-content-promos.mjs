// New React admin promotions: placements and coupons. registerAdminContentPromosScenarios({ scenario, openPage, check, baseUrl, admin })
import assert from "node:assert/strict";
import crypto from "node:crypto";
import Coupon from "../../backend/models/coupon.model.js";
import Placement from "../../backend/models/placement.model.js";
import { invalidatePlacements } from "../../backend/services/placements.service.js";
import { assertPageIsXssSafe, noSideScroll, openAdmin, small } from "./admin-helpers.mjs";

const NOISE = /status of (400|404|409)|ERR_FAILED/;
const get = (page, url) => page.evaluate(async (u) => { const r = await fetch(u); return { status: r.status, body: await r.json().catch(() => null) }; }, url);
async function until(fn, msg, tries = 80) {
  for (let i = 0; i < tries; i++) { if (await fn()) return; await new Promise((r) => setTimeout(r, 50)); }
  assert.fail(msg);
}

export async function registerAdminContentPromosScenarios({ scenario, openPage, check, baseUrl, admin }) {
  const stamp = crypto.randomUUID().slice(0, 8);
  const CODE = `T${stamp.toUpperCase()}`;
  const cleanup = async () => {
    await Placement.deleteMany({ title: new RegExp(stamp) });
    await Coupon.deleteMany({ code: new RegExp(stamp, "i") });
    invalidatePlacements();
  };
  const mine = (page) => get(page, "/api/placements").then((r) => r.body.data.filter((p) => p.title.includes(stamp)));

  await scenario("Promotions (new admin): placements — hostile title, toggle, reorder, validation, targets, Amman times, phone", async () => {
    try {
      const HOSTILE = `عرض <b>&</b> 'خاص' ${stamp}`;
      const page = await openPage();
      await page.setViewportSize({ width: 1440, height: 900 });
      await openAdmin(page, baseUrl, admin, "/promotions");
      await page.getByRole("button", { name: "إضافة موضع" }).first().click();
      await page.locator("#pf-title").fill(HOSTILE);
      const created = page.waitForResponse((r) => r.request().method() === "POST" && r.url().endsWith("/api/placements"));
      await page.getByRole("button", { name: "حفظ" }).click();
      assert.equal((await created).status(), 201);
      await assertPageIsXssSafe(page, [HOSTILE]);
      assert.equal(await page.locator("li b").count(), 0);
      await page.goto(`${baseUrl}/`);
      assert.match(await page.locator(".announce-item", { hasText: `${stamp}` }).first().innerText(), /عرض <b>&<\/b> 'خاص'/);
      assert.equal(await page.locator(".announce-item b").count(), 0);

      await openAdmin(page, baseUrl, admin, "/promotions");
      await page.getByRole("switch", { name: `تفعيل ${HOSTILE}` }).click();
      await page.locator("li", { hasText: stamp }).getByText("متوقف", { exact: true }).waitFor();
      await page.goto(`${baseUrl}/`);
      assert.equal(await page.locator(".announce-item", { hasText: stamp }).count(), 0);

      await Placement.create({ slot: "announcement", title: `إعلان أ ${stamp}`, sort: 0 });
      await Placement.create({ slot: "announcement", title: `إعلان ب ${stamp}`, sort: 0 });
      invalidatePlacements();
      await openAdmin(page, baseUrl, admin, "/promotions");
      await page.getByRole("button", { name: `خفض إعلان أ ${stamp}` }).click();
      await until(async () => { const l = (await mine(page)).filter((p) => p.sort !== undefined).sort((a, b) => a.sort - b.sort || String(a.createdAt).localeCompare(b.createdAt)); return l.findIndex((p) => p.title.startsWith("إعلان ب")) < l.findIndex((p) => p.title.startsWith("إعلان أ")); }, "reordered");

      // Client-side validation: no request is sent for a hostile link or a hero without an image.
      let posts = 0;
      page.on("request", (r) => { if (r.method() === "POST" && r.url().endsWith("/api/placements")) posts += 1; });
      await page.getByRole("button", { name: "إضافة موضع" }).first().click();
      await page.locator("#pf-title").fill(`رابط سيئ ${stamp}`);
      await page.locator("#pf-link").fill("javascript:alert(1)");
      await page.getByRole("button", { name: "حفظ" }).click();
      await page.getByText("رابط غير صالح: يبدأ بـ / أو https://").waitFor();
      await page.locator("#pf-link").fill("");
      await page.locator("#pf-slot").selectOption("hero");
      await page.getByRole("button", { name: "حفظ" }).click();
      await page.getByText("الصورة مطلوبة لهذا الموضع").first().waitFor();
      assert.equal(posts, 0);

      // Target selects only for targeted slots.
      assert.equal(await page.locator("#pf-target-category").count(), 0);
      await page.locator("#pf-slot").selectOption("grid_tile");
      await page.locator("#pf-target-category").waitFor();
      await page.locator("#pf-slot").selectOption("announcement");
      assert.equal(await page.locator("#pf-target-category").count(), 0);

      // Amman-time round trip.
      await page.locator("#pf-title").fill(`جدولة ${stamp}`);
      await page.locator("#pf-starts").fill("2026-09-29T18:00");
      await page.getByRole("button", { name: "حفظ" }).click();
      await page.getByText("تمت إضافة الموضع").waitFor();
      const sched = (await mine(page)).find((p) => p.title.startsWith("جدولة"));
      assert.equal(sched.starts_at, "2026-09-29T15:00:00.000Z");
      await page.locator("li", { hasText: `جدولة ${stamp}` }).getByText(/6:00|18:00/).waitFor();

      // Switching a targeted placement to a non-targeted slot clears the stored target.
      const tile = await Placement.create({ slot: "grid_tile", title: `بطاقة ${stamp}`, image: "https://img.example.test/a.png", target: { category: "men" } });
      invalidatePlacements();
      await openAdmin(page, baseUrl, admin, "/promotions");
      await page.getByRole("button", { name: `تعديل بطاقة ${stamp}` }).click();
      assert.equal(await page.locator("#pf-target-category").inputValue(), "men");
      await page.locator("#pf-slot").selectOption("product_promo");
      await page.getByRole("button", { name: "حفظ" }).click();
      await page.getByText("تم تحديث الموضع").waitFor();
      const after = (await mine(page)).find((p) => p._id === String(tile._id));
      assert.equal(Object.keys(after.target ?? {}).length, 0, "stale target cleared");

      const m = await openPage({ mobile: true });
      await openAdmin(m, baseUrl, admin, "/promotions");
      await m.getByText(`إعلان ب ${stamp}`).waitFor();
      await m.getByRole("button", { name: "إضافة موضع" }).first().click();
      await m.locator("#pf-title").waitFor();
      assert.equal(await noSideScroll(m), true);
      assert.deepEqual((await small(m)).filter((x) => !/^(INPUT|SELECT)/.test(x)), []);
      assert.deepEqual(page.errors.filter((e) => !NOISE.test(e) && !/img\.example\.test/.test(e)), []);
    } finally { await cleanup(); }
  });

  await scenario("Promotions (new admin): coupons, tab keyboard navigation, validation, duplicate, phone", async () => {
    try {
      const page = await openPage();
      await page.setViewportSize({ width: 1440, height: 900 });
      await openAdmin(page, baseUrl, admin, "/promotions");
      const placementsTab = page.locator('[data-tab="placements"]');
      const couponsTab = page.locator('[data-tab="coupons"]');
      await placementsTab.focus();
      await page.keyboard.press("ArrowLeft");
      assert.equal(await couponsTab.getAttribute("aria-selected"), "true");
      assert.match(page.url(), /tab=coupons/);
      await page.keyboard.press("Home");
      assert.equal(await placementsTab.getAttribute("aria-selected"), "true");
      await page.keyboard.press("End");
      assert.equal(await couponsTab.getAttribute("aria-selected"), "true");

      let posts = 0;
      page.on("request", (r) => { if (r.method() === "POST" && r.url().endsWith("/api/coupons")) posts += 1; });
      await page.getByRole("button", { name: "إضافة كود" }).first().click();
      await page.locator("#cf-code").fill(CODE.toLowerCase());
      assert.equal(await page.locator("#cf-code").inputValue(), CODE, "uppercased live");
      await page.locator("#cf-value").fill("150");
      await page.getByRole("button", { name: "حفظ" }).click();
      await page.getByText("النسبة المئوية لا تتجاوز 100").waitFor();
      assert.equal(posts, 0);
      await page.locator("#cf-value").fill("20");
      await page.getByRole("button", { name: "حفظ" }).click();
      await page.getByText("تمت إضافة الكود").waitFor();
      const row = page.locator("tbody tr", { hasText: CODE });
      assert.match(await row.innerText(), /0\/∞/);

      await page.getByRole("button", { name: "إضافة كود" }).first().click();
      await page.locator("#cf-code").fill(CODE);
      await page.locator("#cf-value").fill("5");
      await page.getByRole("button", { name: "حفظ" }).click();
      await page.getByText("هذا الكود موجود مسبقًا").waitFor();
      await page.getByRole("button", { name: "إلغاء" }).click();

      await row.getByRole("button", { name: `تعديل ${CODE}` }).click();
      assert.equal(await page.locator("#cf-code").isDisabled(), true, "code is read-only on edit");
      const put = page.waitForRequest((r) => r.method() === "PUT" && /\/api\/coupons\/[a-f0-9]{24}$/.test(r.url()));
      await page.locator("#cf-value").fill("25");
      await page.getByRole("button", { name: "حفظ" }).click();
      assert.equal("code" in (await put).postDataJSON(), false, "code never sent on edit");
      await page.getByText("تم تحديث الكود").waitFor();

      await row.getByRole("switch", { name: `تفعيل الكود ${CODE}` }).click();
      await until(async () => (await get(page, "/api/coupons")).body.data.find((c) => c.code === CODE).active === false, "deactivated");
      await row.getByRole("button", { name: `حذف ${CODE}` }).click();
      await page.getByRole("alertdialog").getByRole("button", { name: "حذف" }).click();
      await until(async () => !(await Coupon.exists({ code: CODE })), "deleted");

      const m = await openPage({ mobile: true });
      await openAdmin(m, baseUrl, admin, "/promotions?tab=coupons");
      await m.getByRole("button", { name: "إضافة كود" }).first().click();
      await m.locator("#cf-code").waitFor();
      assert.equal(await noSideScroll(m), true);
      assert.deepEqual((await small(m)).filter((x) => !/^(INPUT|SELECT)/.test(x)), []);
      assert.deepEqual(page.errors.filter((e) => !NOISE.test(e)), []);
      void check;
    } finally { await cleanup(); }
  });
}
