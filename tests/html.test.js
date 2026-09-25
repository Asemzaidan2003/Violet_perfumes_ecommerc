import { test } from "node:test";
import assert from "node:assert/strict";
import { html, raw, json, esc } from "../backend/store/html.js";

test("esc escapes & < > \" '", () => {
  assert.equal(esc(`& < > " '`), "&amp; &lt; &gt; &quot; &#39;");
  assert.equal(esc(null), "");
  assert.equal(esc(undefined), "");
});

test("html escapes text interpolations", () => {
  const name = `<img src=x onerror=alert(1)>`;
  const out = String(html`<p>${name}</p>`);
  assert.equal(out, `<p>&lt;img src=x onerror=alert(1)&gt;</p>`);
  assert.ok(!out.includes("<img"));
});

test("html escapes attribute interpolations the same way", () => {
  const value = `"><script>alert(1)</script>`;
  const out = String(html`<input value="${value}">`);
  assert.ok(!out.includes("<script>"));
  assert.ok(out.includes("&quot;&gt;&lt;script&gt;alert(1)&lt;/script&gt;"));
});

test("arrays interpolated into html are joined without extra escaping of markup", () => {
  const items = [html`<li>${"a"}</li>`, html`<li>${"b"}</li>`];
  const out = String(html`<ul>${items}</ul>`);
  assert.equal(out, `<ul><li>a</li><li>b</li></ul>`);
});

test("raw passes trusted markup through unescaped", () => {
  const out = String(html`<div>${raw("<b>bold</b>")}</div>`);
  assert.equal(out, `<div><b>bold</b></div>`);
});

test("nested html() results are not double-escaped", () => {
  const inner = html`<em>${"<x>"}</em>`;
  const outer = String(html`<div>${inner}</div>`);
  assert.equal(outer, `<div><em>&lt;x&gt;</em></div>`);
});

test("json() is script-safe and round-trips through JSON.parse", () => {
  const value = { n: "</script><img src=x onerror=alert(1)>" };
  const out = String(json(value));
  assert.ok(!out.includes("<"));
  assert.ok(!out.includes(">"));
  assert.deepEqual(JSON.parse(out), value);
});
