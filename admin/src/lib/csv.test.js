import { test, expect } from "vitest";
import { toCsv } from "./csv.js";

const BOM = "\uFEFF";
const cell = (v) => toCsv(["h"], [[v]]).slice(BOM.length + 2); // after "h\n"

test("BOM prefix, comma and newline joins", () => {
  expect(toCsv(["a", "b"], [[1, 2], [3, 4]])).toBe(`${BOM}a,b\n1,2\n3,4`);
});
test("formula-guard prefixes an apostrophe, negative numbers included", () => {
  for (const v of ["=1+1", "+1", "-1", "@x", "\tx", "\rx"]) expect(cell(v).replace(/^"|"$/g, "")).toBe(`'${v}`);
  expect(cell(-5)).toBe("'-5");
  expect(cell(5)).toBe("5");
});
test("headers are guarded too", () => {
  expect(toCsv(["=x"], [])).toBe(`${BOM}'=x`);
});
test("quotes, commas and newlines are quoted with doubled quotes", () => {
  expect(cell('a"b')).toBe('"a""b"');
  expect(cell("a,b")).toBe('"a,b"');
  expect(cell("a\nb")).toBe('"a\nb"');
  expect(cell("=a,b")).toBe(`"'=a,b"`);
});
test("null and undefined are empty", () => {
  expect(toCsv(["a", "b"], [[null, undefined]])).toBe(`${BOM}a,b\n,`);
});
