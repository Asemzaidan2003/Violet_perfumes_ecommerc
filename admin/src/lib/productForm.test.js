import { test, expect } from "vitest";
import { datetimeLocalToIso, emptyValues, isoToDatetimeLocal, productSchema, toFormValues, toPayload } from "./productForm.js";

const valid = () => ({ ...emptyValues(), p_name: "عطر", p_category: "Men", oil_id: "OIL1", oil_percentage: 20, alcohol_percentage: 80, size_list: [{ size: "30", price: 10 }] });
const ok = (over) => productSchema.safeParse({ ...valid(), ...over }).success;

test("schema accepts zero percentages and prices, rejects out of range and empties", () => {
  expect(ok({})).toBe(true);
  expect(ok({ oil_percentage: 0, alcohol_percentage: 0, p_offer_percentage: 0 })).toBe(true);
  expect(ok({ size_list: [{ size: "30", price: 0 }] })).toBe(true);
  expect(ok({ oil_percentage: 101 })).toBe(false);
  expect(ok({ alcohol_percentage: -1 })).toBe(false);
  expect(ok({ p_offer_percentage: 100.5 })).toBe(false);
  expect(ok({ oil_percentage: null })).toBe(false);
  expect(ok({ size_list: [] })).toBe(false);
  expect(ok({ size_list: [{ size: "0", price: 1 }] })).toBe(false);
  expect(ok({ size_list: [{ size: "abc", price: 1 }] })).toBe(false);
  expect(ok({ size_list: [{ size: "30", price: -1 }] })).toBe(false);
  expect(ok({ size_list: [{ size: "30", price: null }] })).toBe(false);
  expect(ok({ p_name: "   " })).toBe(false);
  expect(ok({ p_category: "" })).toBe(false);
  expect(ok({ oil_id: "" })).toBe(false);
});

test("size text: 30ml / Arabic digits / spaced units are accepted and normalised", () => {
  expect(ok({ size_list: [{ size: "30ml", price: 1 }] })).toBe(true);
  expect(ok({ size_list: [{ size: " ٥٠ مل ", price: 1 }] })).toBe(true);
  const p = toPayload({ ...valid(), size_list: [{ size: "30ml", price: 12.5 }, { size: " ٥٠ مل ", price: 3 }] });
  expect(p.size_list).toEqual([{ size: "30", price: 12.5 }, { size: "50", price: 3 }]);
});

test("image rule: '.', empty, /img/<24hex>.webp, https accepted; http and other paths rejected", () => {
  const hex = "a".repeat(24);
  for (const v of [".", "", `/img/${hex}.webp`, `/img/${hex}-480.jpg`, "https://x.test/a.png"]) expect(ok({ p_image: v })).toBe(true);
  for (const v of ["http://x.test/a.png", "/img/short.webp", "/other/a.png", "javascript:alert(1)"]) expect(ok({ p_image: v })).toBe(false);
  expect(toPayload({ ...valid(), p_image: "" }).p_image).toBe(".");
});

test("datetime-local <-> ISO", () => {
  expect(datetimeLocalToIso("")).toBeNull();
  expect(datetimeLocalToIso("nonsense")).toBeNull();
  const iso = datetimeLocalToIso("2030-05-06T07:08");
  expect(iso).toBe(new Date(2030, 4, 6, 7, 8).toISOString());
  expect(isoToDatetimeLocal(iso)).toBe("2030-05-06T07:08");
  expect(isoToDatetimeLocal(null)).toBe("");
});

const FULL = {
  p_name: "عطر كامل", p_category: "Women", status: "out of stock", visible: false, p_offer_percentage: 12.5,
  offer_ends_at: "2030-05-06T07:08:09.123Z", oil_id: "OIL9", oil_percentage: 0, alcohol_percentage: 100, p_image: "https://x.test/a.png",
  size_list: [{ size: "30", price: 15.5 }, { size: "50", price: 0 }],
  families: ["oud", "amber"], notes: { top: ["a"], heart: ["b", "c"], base: [] }, description: "وصف", keywords: "kw",
  brand: "64b7f0f0f0f0f0f0f0f0f0f0", images: ["https://x.test/1.png"],
};

test("toFormValues -> toPayload round-trips a full product (incl. offer seconds and brand)", () => {
  const { size_list, ...rest } = toPayload(toFormValues(FULL), { mode: "edit" });
  expect(rest).toEqual({ ...FULL, size_list: undefined });
  expect(size_list).toEqual(FULL.size_list);
});

test("null / missing brand and populated brand", () => {
  expect(toPayload(toFormValues({ ...FULL, brand: null }), { mode: "edit" }).brand).toBeNull();
  expect(toPayload(toFormValues({ ...FULL, brand: undefined }), { mode: "edit" }).brand).toBeNull();
  expect("brand" in toPayload(toFormValues({ ...FULL, brand: null }), { mode: "create" })).toBe(false);
  expect(toFormValues({ ...FULL, brand: { _id: "abc", name_ar: "x" } }).brand).toBe("abc");
});

test("a changed offer end is re-derived from the input", () => {
  const v = toFormValues(FULL);
  const p = toPayload({ ...v, offer_ends_at: "2031-01-02T03:04" });
  expect(p.offer_ends_at).toBe(new Date(2031, 0, 2, 3, 4).toISOString());
  expect(toPayload({ ...v, offer_ends_at: "" }).offer_ends_at).toBeNull();
});
