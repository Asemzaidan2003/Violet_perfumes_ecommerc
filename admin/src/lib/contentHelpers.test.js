import { describe, expect, test } from "vitest";
import { slugify, SLUG_RE, RESERVED_PAGE_SLUGS } from "./slug.js";
import { isHttps, isImageUrl, validLink } from "./links.js";
import { moveItem, renumber, reorderRequests, runSequential } from "./reorder.js";
import { ammanLocalToIso, formatAmman, isoToAmmanLocal } from "./amman.js";

describe("slug", () => {
  test("slugify", () => {
    expect(slugify("  Yves Saint Laurent ")).toBe("yves-saint-laurent");
    expect(slugify("عطور")).toBe("");
    expect(slugify("Dior عطر 2")).toBe("dior-2");
    expect(slugify("--a--")).toBe("a");
    expect(slugify("a".repeat(60))).toHaveLength(40);
  });
  test("SLUG_RE", () => {
    for (const ok of ["ab", "dior", "a-1"]) expect(SLUG_RE.test(ok)).toBe(true);
    for (const bad of ["a", "Dior", "a b", "a_b", "x".repeat(41)]) expect(SLUG_RE.test(bad)).toBe(false);
  });
  test("reserved slugs mirror the server list", () => {
    expect(RESERVED_PAGE_SLUGS).toHaveLength(19);
    expect(RESERVED_PAGE_SLUGS).toContain("cart");
  });
});

describe("links", () => {
  test("validLink", () => {
    for (const ok of ["/c/men", "https://x.com/a", "/"]) expect(validLink(ok)).toBe(true);
    for (const bad of ["http://x.com", "javascript:alert(1)", "//evil", "/\\x", "#a", "foo", "mailto:a@b.c", "", null]) expect(validLink(bad)).toBe(false);
  });
  test("isImageUrl / isHttps", () => {
    expect(isImageUrl("/img/0123456789abcdef01234567.webp")).toBe(true);
    expect(isImageUrl("https://x.com/a.png")).toBe(true);
    expect(isImageUrl("http://x.com/a.png")).toBe(false);
    expect(isImageUrl("/other/a.png")).toBe(false);
    expect(isHttps("https://a.b")).toBe(true);
    expect(isHttps("http://a.b")).toBe(false);
  });
});

describe("reorder", () => {
  test("moveItem edges", () => {
    expect(moveItem([1, 2, 3], 0, -1)).toEqual([1, 2, 3]);
    expect(moveItem([1, 2, 3], 2, 1)).toEqual([1, 2, 3]);
    expect(moveItem([1, 2, 3], 0, 1)).toEqual([2, 1, 3]);
  });
  test("renumber lists only changed items, ties renumbered", () => {
    const list = [{ _id: "a", sort: 0 }, { _id: "b", sort: 0 }, { _id: "c", sort: 2 }];
    expect(renumber(list).map((r) => [r.item._id, r.sort])).toEqual([["b", 1]]);
    expect(reorderRequests(moveItem(list, 0, 1))).toEqual([{ id: "a", body: { sort: 1 } }]);
  });
  test("runSequential reports done ids on failure", async () => {
    const seen = [];
    await expect(runSequential([{ id: 1 }, { id: 2 }, { id: 3 }], async (r) => { if (r.id === 2) throw new Error("x"); seen.push(r.id); })).rejects.toMatchObject({ done: [1] });
    expect(seen).toEqual([1]);
    expect(await runSequential([{ id: 9 }], async () => {})).toEqual([9]);
  });
});

describe("amman", () => {
  test("wall time in Amman to ISO and back (fixed dates)", () => {
    expect(ammanLocalToIso("2026-09-29T18:00")).toBe("2026-09-29T15:00:00.000Z");
    expect(ammanLocalToIso("2026-01-15T09:30")).toBe("2026-01-15T06:30:00.000Z"); // Jordan is UTC+3 all year
    expect(isoToAmmanLocal("2026-09-29T15:00:00.000Z")).toBe("2026-09-29T18:00");
    expect(isoToAmmanLocal(ammanLocalToIso("2026-03-01T00:00"))).toBe("2026-03-01T00:00");
  });
  test("empty and garbage", () => {
    expect(ammanLocalToIso("")).toBeNull();
    expect(ammanLocalToIso("nope")).toBeNull();
    expect(isoToAmmanLocal("")).toBe("");
    expect(isoToAmmanLocal("garbage")).toBe("");
    expect(formatAmman("garbage")).toBe("");
    expect(formatAmman("2026-09-29T15:00:00.000Z")).toMatch(/18:00|6:00/);
  });
});
