import { test, expect } from "vitest";
import { parseNumberInput, parseIntInput, formatForInput, splitList } from "./numbers.js";

test("parseNumberInput handles Arabic digits, decimal commas, blanks and garbage", () => {
  expect(parseNumberInput("٣٠")).toBe(30);
  expect(parseNumberInput("۱۲٫۵")).toBe(12.5);
  expect(parseNumberInput("12,5")).toBe(12.5);
  expect(parseNumberInput(" 7 ")).toBe(7);
  expect(parseNumberInput("0")).toBe(0);
  expect(parseNumberInput(4)).toBe(4);
  for (const bad of ["", "   ", "abc", "1e999", "12ab", null, undefined, NaN, Infinity]) expect(parseNumberInput(bad)).toBeNull();
});

test("parseIntInput truncates toward zero and rejects garbage", () => {
  expect(parseIntInput("٣٫٩")).toBe(3);
  expect(parseIntInput("-2.5")).toBe(-2);
  expect(parseIntInput("")).toBeNull();
  expect(parseIntInput("x")).toBeNull();
});

test("formatForInput is blank for null/NaN and never uses an exponent", () => {
  expect(formatForInput(null)).toBe("");
  expect(formatForInput(undefined)).toBe("");
  expect(formatForInput(NaN)).toBe("");
  expect(formatForInput(0)).toBe("0");
  expect(formatForInput(12.5)).toBe("12.5");
  expect(formatForInput(1e21)).toBe("1000000000000000000000");
  expect(formatForInput(1e-7)).toBe("0.0000001");
});

test("splitList splits on , and Arabic comma, trims, drops empties, dedupes in order", () => {
  expect(splitList("مسك، عود, مسك ,, ورد ")).toEqual(["مسك", "عود", "ورد"]);
  expect(splitList("")).toEqual([]);
  expect(splitList(null)).toEqual([]);
});
