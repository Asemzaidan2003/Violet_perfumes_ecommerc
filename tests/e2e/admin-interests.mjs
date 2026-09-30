// New React admin interest requests. registerAdminInterestsScenarios({ scenario, openPage, check, baseUrl, admin })
import assert from "node:assert/strict";
import mongoose from "mongoose";
import Interest from "../../backend/models/interest.model.js";
import { assertPageIsXssSafe, noSideScroll, openAdmin, small as smallControls } from "./admin-helpers.mjs";

export async function registerAdminInterestsScenarios({ scenario, openPage, check, baseUrl, admin }) {
  const seedInterest = (name, status, extra = {}) => Interest.create({ product_id: new mongoose.Types.ObjectId(),
    product_name: "عطر اهتمام", size: "50", name, phone: "0797770021", note: "ملاحظة", status, ...extra,
  });
  const interestState = (page, id) => page.evaluate(async (i) => (await (await fetch("/api/interests")).json()).data.find((x) => x._id === i)?.status, String(id));

  await scenario("Interest requests (new admin): filter and status actions", async () => {
    let n, c, cl;
    try {
      n = await seedInterest("اهتمام جديد", "new");
      c = await seedInterest("اهتمام تواصل", "contacted");
      cl = await seedInterest("اهتمام مغلق", "closed");
      const page = await openPage();
      await page.setViewportSize({ width: 1440, height: 900 });
      await openAdmin(page, baseUrl, admin, "/interests");
      const row = (name) => page.locator("tr", { hasText: name });
      await row("اهتمام جديد").waitFor();
      await row("اهتمام تواصل").waitFor();
      await row("اهتمام مغلق").waitFor();
      const btn = (name, label) => row(name).getByRole("button", { name: label });
      assert.equal(await btn("اهتمام جديد", "تم التواصل مع اهتمام جديد").count(), 1);
      assert.equal(await btn("اهتمام جديد", "إغلاق طلب اهتمام جديد").count(), 1);
      assert.equal(await btn("اهتمام تواصل", "تم التواصل مع اهتمام تواصل").count(), 0, "hidden when contacted");
      assert.equal(await btn("اهتمام تواصل", "إغلاق طلب اهتمام تواصل").count(), 1);
      assert.equal(await btn("اهتمام مغلق", "إغلاق طلب اهتمام مغلق").count(), 0, "hidden when closed");
      assert.equal(await btn("اهتمام مغلق", "تم التواصل مع اهتمام مغلق").count(), 1);
      assert.equal(await row("اهتمام جديد").locator('a[href="https://wa.me/962797770021"]').count(), 1);

      await page.selectOption("#i-status", "closed");
      await row("اهتمام مغلق").waitFor();
      await row("اهتمام جديد").waitFor({ state: "detached" });
      await page.selectOption("#i-status", "new");
      await row("اهتمام جديد").waitFor();
      await row("اهتمام مغلق").waitFor({ state: "detached" });

      // Contacting a new row updates the API and, under the "new" filter, the row leaves the list.
      await btn("اهتمام جديد", "تم التواصل مع اهتمام جديد").click();
      await row("اهتمام جديد").waitFor({ state: "detached" });
      assert.equal(await interestState(page, n._id), "contacted");
      await page.selectOption("#i-status", "contacted");
      await row("اهتمام جديد").waitFor();
      await btn("اهتمام جديد", "إغلاق طلب اهتمام جديد").click();
      await row("اهتمام جديد").waitFor({ state: "detached" });
      assert.equal(await interestState(page, n._id), "closed");
      assert.equal(await interestState(page, c._id), "contacted");
      assert.equal(await interestState(page, cl._id), "closed");
      assert.equal(await noSideScroll(page), true);
      check(page);
    } finally {
      await Interest.deleteMany({ _id: { $in: [n, c, cl].filter(Boolean).map((d) => d._id) } });
    }
  });

  await scenario("Interest requests (new admin): hostile strings are inert", async () => {
    const B = `<svg onload=window.__xss=2>`;
    const C = `a & b 'q' <b>x</b>`;
    const D = `" onmouseover=window.__xss=5 x="`;
    let hostile;
    try {
      hostile = await seedInterest(D, "new", { product_name: B, note: C, phone: "0782223334" });
      const page = await openPage();
      await page.setViewportSize({ width: 1440, height: 900 });
      await openAdmin(page, baseUrl, admin, "/interests");
      await assertPageIsXssSafe(page, [D, C, B]);
      assert.equal(await page.locator('a[href="https://wa.me/962782223334"]').count(), 1);
      check(page);
    } finally {
      if (hostile) await Interest.deleteOne({ _id: hostile._id });
    }
  });

  await scenario("Interest requests (new admin): phone layout", async () => {
    let i;
    try {
      i = await seedInterest("اهتمام الهاتف", "new");
      const page = await openPage({ mobile: true });
      await openAdmin(page, baseUrl, admin, "/interests");
      await page.locator("li", { hasText: "اهتمام الهاتف" }).waitFor();
      assert.equal(await page.locator("table").count(), 0, "cards, not a table, on a phone");
      assert.equal(await noSideScroll(page), true);
      const small = await smallControls(page);
      assert.deepEqual(small, []);
      check(page);
    } finally {
      if (i) await Interest.deleteOne({ _id: i._id });
    }
  });
}
