import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { startTestApp, loginAs } from "./helpers.js";

let t, cookie;
before(async () => {
  t = await startTestApp();
  cookie = await loginAs(t.url);
});
after(() => t.close());

const putSettings = (patch) =>
  fetch(`${t.url}/api/settings`, {
    method: "PUT",
    headers: { cookie, "Content-Type": "application/json" },
    body: JSON.stringify(patch),
  });
const getSettings = () => fetch(`${t.url}/api/settings`, { headers: { cookie } });

test("default store_name and tagline are the Arabic brand defaults", async () => {
  const res = await getSettings();
  const { data } = await res.json();
  assert.equal(data.store_name, "نسمات");
  assert.equal(data.tagline, "بوتيك العطور في الأردن");
});

test("a bad logo URL is rejected with 400", async () => {
  const res = await putSettings({ logo_light: "javascript:alert(1)" });
  assert.equal(res.status, 400);
});

test("a valid uploaded-style logo URL saves", async () => {
  const res = await putSettings({ logo_light: "/img/0123456789abcdef01234567.webp" });
  assert.equal(res.status, 200);
  const { data } = await res.json();
  assert.equal(data.logo_light, "/img/0123456789abcdef01234567.webp");
});

test("store_name appears in the home page title and footer, escaped when hostile", async () => {
  const hostile = `<script>alert(1)</script>`;
  const save = await putSettings({ store_name: hostile });
  assert.equal(save.status, 200);

  const page = await fetch(`${t.url}/`);
  const body = await page.text();
  assert.equal(body.includes("<script>alert(1)</script>"), false, "must be escaped, never raw");
  assert.match(body, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);

  await putSettings({ store_name: "نسمات" });
});

test("with no logo set, the default SVG mark renders in the header", async () => {
  await putSettings({ logo_light: "", logo_dark: "" });
  const page = await fetch(`${t.url}/`);
  const body = await page.text();
  assert.match(body, /logo\.svg/);
});

test("with a logo set, it renders in the header instead of the SVG mark", async () => {
  await putSettings({ logo_light: "/img/0123456789abcdef01234567.webp" });
  const page = await fetch(`${t.url}/`);
  const body = await page.text();
  assert.match(body, /0123456789abcdef01234567\.webp/);
  await putSettings({ logo_light: "" });
});

test("favicon defaults to the SVG mark, and a custom favicon overrides it", async () => {
  const defaultPage = await fetch(`${t.url}/`);
  assert.match(await defaultPage.text(), /rel="icon" href="[^"]*logo\.svg[^"]*"/);

  await putSettings({ favicon: "/img/0123456789abcdef01234567.webp" });
  const page = await fetch(`${t.url}/`);
  const body = await page.text();
  assert.match(body, /rel="icon" href="[^"]*0123456789abcdef01234567\.webp[^"]*"/);
  await putSettings({ favicon: "" });
});

test("share_image becomes og:image on the home page", async () => {
  await putSettings({ share_image: "/img/0123456789abcdef01234567.webp" });
  const page = await fetch(`${t.url}/`);
  const body = await page.text();
  assert.match(body, /og:image" content="[^"]*0123456789abcdef01234567\.webp"/);
  await putSettings({ share_image: "" });
});

test("store_name over 40 characters is rejected with 400", async () => {
  const res = await putSettings({ store_name: "س".repeat(41) });
  assert.equal(res.status, 400);
});

test("tagline over 80 characters is rejected with 400", async () => {
  const res = await putSettings({ tagline: "س".repeat(81) });
  assert.equal(res.status, 400);
});
