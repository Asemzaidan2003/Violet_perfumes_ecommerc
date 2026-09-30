// New React admin store settings (identity, theme, advanced colours). registerAdminContentSettingsScenarios({ scenario, openPage, check, baseUrl, admin, pngPath })
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { noSideScroll, openAdmin, small } from "./admin-helpers.mjs";

const NOISE = /status of (400|404|409)|ERR_FAILED/;
const settingsOf = (page) => page.evaluate(async () => (await (await fetch("/api/settings")).json()).data);
const putSettings = (page, patch) => page.evaluate(async (b) => (await fetch("/api/settings", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(b) })).status, patch);
const putResponse = (page) => page.waitForResponse((r) => r.url().endsWith("/api/settings") && r.request().method() === "PUT");
const cssVar = (page, name) => page.evaluate((n) => getComputedStyle(document.documentElement).getPropertyValue(n).trim(), name);

export async function registerAdminContentSettingsScenarios({ scenario, openPage, check, baseUrl, admin, pngPath }) {
  const stamp = crypto.randomUUID().slice(0, 8);
  // Restores exactly what these scenarios touch (theme incl. every override, identity, contact fields).
  async function restore(page, orig) {
    const now = await settingsOf(page);
    const clear = Object.fromEntries(Object.keys(now.theme?.overrides ?? {}).map((k) => [k, ""]));
    await putSettings(page, {
      store_name: orig.store_name, tagline: orig.tagline, logo_light: orig.logo_light, whatsapp: orig.whatsapp, instagram: orig.instagram,
      delivery_fee: orig.delivery_fee, free_delivery_over: orig.free_delivery_over,
      theme: { bg: orig.theme.bg, surface: orig.theme.surface, text: orig.theme.text, accent: orig.theme.accent, overrides: { ...clear, ...(orig.theme.overrides ?? {}) } },
    });
  }

  await scenario("Settings (new admin): Save waits for the load, identity and logo, advanced override, whatsapp banner, hostile name", async () => {
    let page, orig;
    try {
      page = await openPage();
      await page.setViewportSize({ width: 1440, height: 900 });
      await openAdmin(page, baseUrl, admin, "/settings");
      await page.locator("#saveBtn:not([disabled])").waitFor();
      orig = await settingsOf(page);

      // While the GET is pending Save is disabled, so client defaults can never overwrite the stored values.
      const slow = await openPage();
      await slow.route(/\/api\/settings$/, async (rt) => { await new Promise((r) => setTimeout(r, 1200)); return rt.continue(); });
      await openAdmin(slow, baseUrl, admin, "/settings");
      assert.equal(await slow.locator("#saveBtn").isDisabled(), true);
      await slow.locator("#saveBtn:not([disabled])").waitFor();

      const HOSTILE = `<b onmouseover=window.__xss=1>${stamp}`;
      await page.locator("#store_name").fill(HOSTILE);
      await page.setInputFiles("#logo_light_file", pngPath);
      await page.waitForFunction(() => document.getElementById("logo_light").value.startsWith("/img/"));
      let done = putResponse(page);
      await page.locator("#saveBtn").click();
      assert.equal((await done).status(), 200);
      await page.getByText("تم حفظ الإعدادات").waitFor();
      assert.equal(await page.evaluate(() => window.__xss), undefined);
      assert.equal(await page.locator("#store_name").inputValue(), HOSTILE);
      const store = await openPage();
      await store.goto(`${baseUrl}/`);
      assert.ok((await store.title()).includes(stamp), "title has the store name");
      assert.match(await store.getAttribute(".site-header .brand-mark", "src"), /^\/img\//);
      check(store);

      await page.locator("#logo_light_remove").click();
      done = putResponse(page);
      await page.locator("#saveBtn").click();
      await done;
      assert.equal((await settingsOf(page)).logo_light, "", "logo removal persists");

      await page.locator("#advancedColors summary").click();
      await page.locator("#ov_bg-glass").fill("#336699");
      done = putResponse(page);
      await page.locator("#saveBtn").click();
      await done;
      await store.goto(`${baseUrl}/`);
      assert.equal(await store.locator(".site-header").evaluate((el) => getComputedStyle(el).backgroundColor), "rgb(51, 102, 153)");
      await page.locator('[data-reset="bg-glass"]').click();
      await page.locator("#advancedColors").getByText("مشتق").first().waitFor();
      done = putResponse(page);
      await page.locator("#saveBtn").click();
      await done;
      assert.equal((await settingsOf(page)).theme.overrides["bg-glass"], undefined, "per-token reset persists");

      await page.locator("#ov_line").fill("#445566");
      await page.locator("#ov_focus").fill("#778899");
      done = putResponse(page);
      await page.locator("#saveBtn").click();
      await done;
      assert.equal(Object.keys((await settingsOf(page)).theme.overrides).length, 2);
      await page.getByRole("button", { name: "مسح كل التخصيصات" }).click();
      done = putResponse(page);
      await page.locator("#saveBtn").click();
      await done;
      assert.equal(Object.keys((await settingsOf(page)).theme.overrides).length, 0, "clear-all persists");

      await page.locator("#whatsapp").fill("not-a-number");
      done = putResponse(page);
      await page.locator("#saveBtn").click();
      assert.equal((await done).status(), 400);
      await page.locator("#error").waitFor();
      assert.match(await page.locator("#error").innerText(), /[؀-ۿ]/, "the server's Arabic message is shown");
      await page.locator("#whatsapp").fill("962791234567");
      await page.locator("#delivery_fee").fill("3");
      await page.locator("#delivery_fee").blur();
      done = putResponse(page);
      await page.locator("#saveBtn").click();
      assert.equal((await done).status(), 200);
      await page.reload();
      await page.locator("#saveBtn:not([disabled])").waitFor();
      assert.equal(await page.locator("#whatsapp").inputValue(), "962791234567");
      assert.equal(await page.locator("#delivery_fee").inputValue(), "3");
      assert.deepEqual(page.errors.filter((e) => !NOISE.test(e)), []);
    } finally { if (page && orig) await restore(page, orig); }
  });

  await scenario("Settings (new admin): accent and reset, light theme, contrast warnings never block Save, phone layout", async () => {
    let page, orig;
    try {
      page = await openPage();
      await page.setViewportSize({ width: 1440, height: 900 });
      await openAdmin(page, baseUrl, admin, "/settings");
      await page.locator("#saveBtn:not([disabled])").waitFor();
      orig = await settingsOf(page);
      const store = await openPage();
      await store.goto(`${baseUrl}/`);
      const goldBefore = await cssVar(store, "--gold");

      await page.locator("#theme_accent").fill("#3366cc");
      let done = putResponse(page);
      await page.locator("#saveBtn").click();
      await done;
      await store.goto(`${baseUrl}/`);
      assert.equal((await cssVar(store, "--gold")).toLowerCase(), "#3366cc");
      done = putResponse(page);
      await page.locator("#resetThemeBtn").click();
      await done;
      await store.goto(`${baseUrl}/`);
      assert.equal(await cssVar(store, "--gold"), goldBefore, "reset restores the accent");

      // Near-black colours: warnings appear, Save still works.
      for (const [id, v] of [["theme_bg", "#000000"], ["theme_surface", "#010101"], ["theme_text", "#020202"], ["theme_accent", "#030303"]]) await page.locator(`#${id}`).fill(v);
      assert.equal(await page.getByText(/^تحذير:/).count(), 3);
      assert.match(await page.locator("#ratioBg").innerText(), /\(1\.0:1\)/);
      done = putResponse(page);
      await page.locator("#saveBtn").click();
      assert.equal((await done).status(), 200, "contrast is informational");

      // The owner's light theme.
      for (const [id, v] of [["theme_bg", "#ffffff"], ["theme_surface", "#ebebeb"], ["theme_text", "#000000"], ["theme_accent", "#a27b44"]]) await page.locator(`#${id}`).fill(v);
      done = putResponse(page);
      await page.locator("#saveBtn").click();
      await done;
      await store.goto(`${baseUrl}/`);
      const lum = await store.locator(".site-header").evaluate((el) => {
        const [r, g, b] = getComputedStyle(el).backgroundColor.match(/\d+(\.\d+)?/g).slice(0, 3).map(Number);
        const f = (c) => { const v = c / 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
        return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
      });
      assert.ok(lum > 0.8, `light header luminance ${lum}`);
      done = putResponse(page);
      await page.locator("#resetThemeBtn").click();
      await done;
      assert.equal(await page.locator("#theme_bg").inputValue(), "#0e0c0a");

      const m = await openPage({ mobile: true });
      await openAdmin(m, baseUrl, admin, "/settings");
      await m.locator("#saveBtn:not([disabled])").waitFor();
      assert.equal(await noSideScroll(m), true);
      assert.deepEqual((await small(m)).filter((x) => !/^INPUT/.test(x)), []);
      const bar = await m.locator("#saveBtn").boundingBox();
      const tabs = await m.locator('nav[aria-label="التنقل السريع"]').boundingBox();
      assert.ok(bar.y + bar.height <= tabs.y + 1, "Save bar sits above the tab bar");
      assert.deepEqual(page.errors.filter((e) => !NOISE.test(e)), []);
    } finally { if (page && orig) await restore(page, orig); }
  });
}
