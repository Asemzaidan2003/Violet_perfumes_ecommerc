import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { startTestApp, loginAs } from "./helpers.js";
import { DEFAULT_THEME } from "../backend/store/theme.js";

let t, cookie;
before(async () => {
  t = await startTestApp();
  cookie = await loginAs(t.url);
});
after(() => t.close());

const putTheme = (theme) =>
  fetch(`${t.url}/api/settings`, {
    method: "PUT",
    headers: { cookie, "Content-Type": "application/json" },
    body: JSON.stringify({ theme }),
  });

test("defaults render no theme style tag", async () => {
  const res = await fetch(`${t.url}/`);
  const body = await res.text();
  assert.equal(body.includes('id="theme"'), false);
});

test("an invalid hex is rejected with 400", async () => {
  const res = await putTheme({ bg: "notacolor", surface: "#17130F", text: "#F4EDE3", accent: "#D4AF37" });
  assert.equal(res.status, 400);
});

test("a CSS-injection attempt is rejected with 400", async () => {
  const res = await putTheme({ bg: "#000;}body{display:none", surface: "#17130F", text: "#F4EDE3", accent: "#D4AF37" });
  assert.equal(res.status, 400);
});

test("any valid hex colours save, even low-contrast ones (owner decision)", async () => {
  const res = await putTheme({ bg: "#000000", surface: "#010101", text: "#020202", accent: "#030303" });
  assert.equal(res.status, 200);
});

test("a valid theme returns 200, and GET / then contains the theme style with the values", async () => {
  const theme = { bg: "#101010", surface: "#1a1a1a", text: "#f5f5f5", accent: "#e0a030" };
  const res = await putTheme(theme);
  assert.equal(res.status, 200);
  const { data } = await res.json();
  assert.equal(data.theme.bg, theme.bg);

  const page = await fetch(`${t.url}/`);
  const body = await page.text();
  assert.match(body, /id="theme"/);
  assert.match(body, new RegExp(`--bg:${theme.bg}`, "i"));
  assert.match(body, new RegExp(`--gold:${theme.accent}`, "i"));
  assert.match(body, new RegExp(`theme-color" content="${theme.bg}"`, "i"));

  // Restore defaults so later suites/tests see the plain theme again.
  await putTheme(DEFAULT_THEME);
});

test("an unknown override token is rejected with 400", async () => {
  const res = await fetch(`${t.url}/api/settings`, {
    method: "PUT", headers: { cookie, "Content-Type": "application/json" },
    body: JSON.stringify({ theme: { ...DEFAULT_THEME, overrides: { evil: "#123456" } } }),
  });
  assert.equal(res.status, 400);
});

test("a CSS-injection attempt in an override value is rejected with 400", async () => {
  const res = await fetch(`${t.url}/api/settings`, {
    method: "PUT", headers: { cookie, "Content-Type": "application/json" },
    body: JSON.stringify({ theme: { ...DEFAULT_THEME, overrides: { "surface-2": "#000;}body{display:none" } } }),
  });
  assert.equal(res.status, 400);
});

test("a whitelisted override saves and appears in the theme style tag", async () => {
  const res = await fetch(`${t.url}/api/settings`, {
    method: "PUT", headers: { cookie, "Content-Type": "application/json" },
    body: JSON.stringify({ theme: { ...DEFAULT_THEME, overrides: { "surface-2": "#123456" } } }),
  });
  assert.equal(res.status, 200);
  const { data } = await res.json();
  assert.equal(data.theme.overrides["surface-2"], "#123456");

  const page = await fetch(`${t.url}/`);
  const body = await page.text();
  assert.match(body, /--surface-2:#123456/i);

  // Clear the override explicitly (an empty overrides object is a no-op merge, not a reset).
  await fetch(`${t.url}/api/settings`, {
    method: "PUT", headers: { cookie, "Content-Type": "application/json" },
    body: JSON.stringify({ theme: { ...DEFAULT_THEME, overrides: { "surface-2": "" } } }),
  });
});
