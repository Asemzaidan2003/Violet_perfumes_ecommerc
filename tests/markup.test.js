import { test } from "node:test";
import assert from "node:assert/strict";
import { renderMarkup } from "../backend/store/markup.js";

test("headings and paragraphs", () => {
  const out = renderMarkup("# عنوان\n\nنص عادي\n\n## عنوان فرعي");
  assert.equal(out, "<h2>عنوان</h2>\n<p>نص عادي</p>\n<h3>عنوان فرعي</h3>");
});

test("bullet list", () => {
  const out = renderMarkup("- أول\n- ثاني");
  assert.equal(out, "<ul><li>أول</li><li>ثاني</li></ul>");
});

test("bold", () => {
  assert.equal(renderMarkup("نص **مهم** هنا"), "<p>نص <strong>مهم</strong> هنا</p>");
});

test("internal and https links pass through", () => {
  assert.equal(renderMarkup("[الصفحة](/page/terms)"), '<p><a href="/page/terms" rel="noopener">الصفحة</a></p>');
  assert.equal(renderMarkup("[موقع](https://example.com)"), '<p><a href="https://example.com" rel="noopener">موقع</a></p>');
});

test("javascript: links are rejected and left as literal text", () => {
  const out = renderMarkup("[انقر](javascript:alert(1))");
  assert.ok(!out.includes("<a "), out);
  assert.ok(!out.includes("href="), out);
});

test("raw script tags are escaped, never executed", () => {
  const out = renderMarkup("<script>alert(1)</script>");
  assert.ok(!out.includes("<script>"), out);
  assert.match(out, /&lt;script&gt;/);
});

test("quote-onmouseover injection attempt is escaped", () => {
  const out = renderMarkup('" onmouseover="alert(1)');
  assert.ok(!out.includes('"'), out);
  assert.match(out, /&quot;/);
});

test("nested brackets in link text do not break escaping", () => {
  const out = renderMarkup("[a[b]c](/page/x)");
  // The non-greedy match stops at the first "]"; the rest is escaped literal text, never markup.
  assert.ok(!out.includes("<script"));
  assert.doesNotMatch(out, /<a[^>]*<a/);
});

test("unknown constructs are escaped, not passed through", () => {
  const out = renderMarkup("*not bold* __also not__");
  assert.equal(out, "<p>*not bold* __also not__</p>");
});
