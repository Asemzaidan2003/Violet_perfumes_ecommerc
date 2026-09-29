import { test, expect } from "vitest";
import { money, shortId } from "./format.js";

test("money always shows two decimals and the currency", () => {
  expect(money(12.5)).toBe("12.50 JOD");
  expect(money("40")).toBe("40.00 JOD");
  expect(money(undefined)).toBe("0.00 JOD");
});

test("shortId is the last six characters, uppercased", () => {
  expect(shortId("65f0a1b2c3d4e5f6a7b8c9d0")).toBe("B8C9D0");
  expect(shortId("")).toBe("");
});
