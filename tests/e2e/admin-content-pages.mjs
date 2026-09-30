// New React admin content pages: list, editor, toolbar, safe live preview. registerAdminContentPagesScenarios({ scenario, openPage, check, baseUrl, admin })
import assert from "node:assert/strict";
import crypto from "node:crypto";
import Page from "../../backend/models/page.model.js";
import { invalidatePages } from "../../backend/services/pages.service.js";
import { assertPageIsXssSafe, noSideScroll, openAdmin, small } from "./admin-helpers.mjs";

const NOISE = /status of (400|404|409)|ERR_FAILED/;
const get = (page, url) => page.evaluate(async (u) => { const r = await fetch(u); return { status: r.status, body: await r.json().catch(() => null) }; }, url);
async function until(fn, msg, tries = 80) {
  for (let i = 0; i < tries; i++) { if (await fn()) return; await new Promise((r) => setTimeout(r, 50)); }
  assert.fail(msg);
}

export async function registerAdminContentPagesScenarios({ scenario, openPage, check, baseUrl, admin }) {
  const stamp = crypto.randomUUID().slice(0, 8);
  const slug = `ship-${stamp}`;
  const cleanup = async () => { await Page.deleteMany({ slug: new RegExp(stamp) }); invalidatePages(); };

  await scenario("Content pages: create with toolbar and preview, publish, footer link, reorder, reserved slug, delete", async () => {
    try {
      const HOSTILE = `"><img src=x onerror=window.__xss=1> ${stamp}`;
      await Page.create({ slug: `a-${stamp}`, title: `صفحة أ ${stamp}`, footer_group: "none", sort: 0, published: false });
      await Page.create({ slug: `b-${stamp}`, title: HOSTILE, footer_group: "none", sort: 1, published: false });
      invalidatePages();
      const page = await openPage();
      await page.setViewportSize({ width: 1440, height: 900 });
      await openAdmin(page, baseUrl, admin, "/pages");
      await assertPageIsXssSafe(page, [HOSTILE]);
      await page.getByRole("heading", { name: "بدون" }).waitFor();

      await page.getByRole("button", { name: "إضافة صفحة" }).first().click();
      await page.locator("#pf-title").fill(`سياسة الشحن ${stamp}`);
      await page.locator("#pf-slug").fill(slug);
      await page.locator("#pf-body").fill("سياسة الشحن\n\n- نوصل لكل الأردن\n- الدفع عند الاستلام");
      await page.locator("#pf-body").evaluate((el) => el.setSelectionRange(0, 0));
      await page.getByRole("button", { name: "عنوان رئيسي (H2)" }).click();
      assert.match(await page.locator("#pf-body").inputValue(), /^# سياسة الشحن/);
      await page.locator("#pf-preview h2").waitFor();
      assert.equal(await page.locator("#pf-preview li").count(), 2);
      const post = page.waitForRequest((r) => r.method() === "POST" && r.url().endsWith("/api/pages"));
      await page.getByRole("button", { name: "حفظ" }).click();
      assert.equal((await post).postDataJSON().slug, slug);
      await page.getByText(`سياسة الشحن ${stamp}`).first().waitFor();

      await page.goto(`${baseUrl}/`);
      assert.ok(await page.locator(`footer a[href="/page/${slug}"]`).count(), "published page linked from the storefront footer");

      await openAdmin(page, baseUrl, admin, "/pages");
      await page.getByRole("button", { name: "إضافة صفحة" }).first().click();
      await page.locator("#pf-title").fill("سلة");
      await page.locator("#pf-slug").fill("cart");
      await page.getByRole("button", { name: "حفظ" }).click();
      await page.getByText("هذا الرابط محجوز").waitFor();
      await page.getByRole("button", { name: "إلغاء" }).click();

      await page.getByRole("button", { name: `خفض صفحة أ ${stamp}` }).click();
      await until(async () => {
        const l = (await get(page, "/api/pages")).body.data;
        return l.findIndex((p) => p.slug === `b-${stamp}`) < l.findIndex((p) => p.slug === `a-${stamp}`);
      }, "reordered within the group");

      await page.getByRole("switch", { name: `نشر صفحة أ ${stamp}` }).click();
      await until(async () => (await get(page, "/api/pages")).body.data.find((p) => p.slug === `a-${stamp}`).published === true, "published");

      await page.getByRole("button", { name: `حذف سياسة الشحن ${stamp}` }).click();
      await page.getByRole("alertdialog").getByRole("button", { name: "حذف" }).click();
      await until(async () => !(await Page.exists({ slug })), "deleted");

      const m = await openPage({ mobile: true });
      await openAdmin(m, baseUrl, admin, "/pages");
      await m.getByText(`صفحة أ ${stamp}`).waitFor();
      assert.equal(await m.locator("table").count(), 0);
      await m.getByRole("button", { name: "إضافة صفحة" }).first().click();
      await m.locator("#pf-title").waitFor();
      assert.equal(await noSideScroll(m), true);
      assert.deepEqual((await small(m)).filter((x) => !/^(INPUT|TEXTAREA)/.test(x)), []);
      assert.deepEqual(page.errors.filter((e) => !NOISE.test(e)), []);
    } finally { await cleanup(); }
  });

  await scenario("Content pages: preview shows script and javascript: links as literal text; stale responses never win", async () => {
    try {
      const page = await openPage();
      await page.setViewportSize({ width: 1440, height: 900 });
      let calls = 0;
      await page.route(/\/api\/pages\/preview$/, async (rt) => {
        calls += 1;
        if (calls === 1) await new Promise((r) => setTimeout(r, 1500)); // the first response arrives after the second
        return rt.continue();
      });
      await openAdmin(page, baseUrl, admin, "/pages");
      await page.getByRole("button", { name: "إضافة صفحة" }).first().click();
      await page.locator("#pf-body").fill("# قديم");
      await new Promise((r) => setTimeout(r, 450));
      await page.locator("#pf-body").fill("# جديد");
      await page.locator("#pf-preview").getByText("جديد").waitFor();
      await new Promise((r) => setTimeout(r, 1700));
      assert.equal(await page.locator("#pf-preview").getByText("قديم").count(), 0, "stale preview never overwrites the newer one");

      await page.unroute(/\/api\/pages\/preview$/);
      await page.locator("#pf-body").fill("<script>window.__xss=1</script>\n\n[x](javascript:alert(1))");
      await page.locator("#pf-preview").getByText("[x](javascript:alert(1))").waitFor();
      assert.equal(await page.locator("#pf-preview script, #pf-preview a").count(), 0);
      assert.equal(await page.evaluate(() => window.__xss), undefined);
      assert.match(await page.locator("#pf-preview").innerText(), /<script>window\.__xss=1<\/script>/);
      check(page);
    } finally { await cleanup(); }
  });
}
