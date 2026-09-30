import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";
import { htmlToReact } from "./htmlToReact.js";
import { applyToolbar } from "./markupToolbar.js";

const html = (s) => renderToStaticMarkup(createElement("div", null, ...htmlToReact(s)));

describe("htmlToReact", () => {
  test("allowed tags render", () => {
    const out = html("<h2>عنوان</h2>\n<p>نص <strong>غامق</strong><br>سطر</p>\n<ul><li>أ</li><li>ب</li></ul>");
    expect(out).toContain("<h2");
    expect(out).toContain("<strong>غامق</strong>");
    expect(out).toContain("<br/>");
    expect(out.match(/<li>/g)).toHaveLength(2);
  });
  test("a script tag becomes literal text with no element", () => {
    const out = html("<p>&lt;x&gt;</p><script>alert(1)</script>");
    expect(out).not.toContain("<script");
    expect(out).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
    expect(out).toContain("&lt;x&gt;");
  });
  test("img with onerror is literal text", () => {
    const out = html('<img src=x onerror="window.__xss=1">');
    expect(out).not.toContain("<img");
    expect(out).toContain("&lt;img");
  });
  test("javascript: links lose the anchor but keep the text", () => {
    const out = html('<p><a href="javascript:alert(1)">اضغط</a></p>');
    expect(out).not.toContain("<a");
    expect(out).toContain("اضغط");
  });
  test("internal and https links render with rel=noopener", () => {
    expect(html('<a href="/page/terms">شروط</a>')).toContain('<a href="/page/terms" rel="noopener"');
    expect(html('<a href="https://x.com/a?b=1&amp;c=2">x</a>')).toContain('href="https://x.com/a?b=1&amp;c=2"');
    expect(html('<a href="http://x.com">x</a>')).not.toContain("<a");
  });
  test("nested unknown tags flatten to text", () => {
    const out = html("<div><span>hi</span></div>");
    expect(out).not.toContain("<span");
    expect(out).toContain("hi");
  });
  test("entities and stray angle brackets stay text", () => {
    expect(html("a &amp; b < c")).toContain("a &amp; b &lt; c");
  });
});

describe("applyToolbar", () => {
  test("h2 at the start of the current line, mid-line cursor", () => {
    const r = applyToolbar("سطر أول\nسطر ثان", 12, 12, "h2");
    expect(r.value).toBe("سطر أول\n# سطر ثان");
    expect(r.selStart).toBe(14);
  });
  test("toggling the same heading removes it, the other level swaps it", () => {
    expect(applyToolbar("## عنوان", 3, 3, "h").value).toBe("عنوان");
    expect(applyToolbar("# عنوان", 3, 3, "h").value).toBe("## عنوان");
    expect(applyToolbar("## عنوان", 3, 3, "h2").value).toBe("# عنوان");
    expect(applyToolbar("عنوان", 0, 0, "h2").value).toBe("# عنوان");
  });
  test("bold wraps the selection and keeps it selected; toggles off", () => {
    const r = applyToolbar("ab cd ef", 3, 5, "b");
    expect(r).toEqual({ value: "ab **cd** ef", selStart: 5, selEnd: 7 });
    expect(applyToolbar(r.value, r.selStart, r.selEnd, "b").value).toBe("ab cd ef");
    expect(applyToolbar("x", 1, 1, "b").value).toBe("x****");
  });
  test("list prefixes every selected line and toggles off when all have it", () => {
    const r = applyToolbar("a\nb\nc", 0, 3, "list");
    expect(r.value).toBe("- a\n- b\nc");
    expect(applyToolbar(r.value, 0, 7, "list").value).toBe("a\nb\nc");
    expect(applyToolbar("- a\nb", 0, 5, "list").value).toBe("- a\n- b");
  });
  test("link wraps the selection with the page slug", () => {
    const r = applyToolbar("انظر الشروط الآن", 5, 11, "link", "terms");
    expect(r.value).toBe("انظر [الشروط](/page/terms) الآن");
    expect(r.value.slice(r.selStart, r.selEnd)).toBe("الشروط");
  });
  test("link with an empty selection and no slug", () => {
    expect(applyToolbar("x", 1, 1, "link").value).toBe("x[](/page/slug)");
  });
});
