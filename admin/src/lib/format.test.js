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

import { waNational, num, pct, trendClass, trendArrow, fmtDate, fmtDateShort, fmtDateTime, toDateInputValue, arabicStatus, paymentLabel, waLink, STATUSES } from "./format.js";

test("num groups thousands and never throws", () => {
  expect(num(1234.5)).toBe("1,234.5");
  for (const v of [undefined, null, ""]) expect(num(v)).toBe("0");
});

test("pct signs positives, keeps one decimal", () => {
  expect(pct(12.34)).toBe("+12.3%");
  expect(pct(-5)).toBe("-5.0%");
  expect(pct(0)).toBe("0.0%");
  expect(pct(undefined)).toBe("0.0%");
});

test("trend helpers", () => {
  expect([trendClass(3), trendClass(-1), trendClass(0), trendClass(null)]).toEqual(["up", "down", "flat", "flat"]);
  expect([trendArrow(3), trendArrow(-1), trendArrow(0)]).toEqual(["▲", "▼", "―"]);
});

test("dates are en-GB and never throw on empty input", () => {
  expect(fmtDate("2026-09-05T10:00:00Z")).toBe("05/09/2026");
  expect(fmtDateShort("2026-07-20")).toBe("20/07");
  expect(toDateInputValue(new Date(2026, 8, 5))).toBe("2026-09-05");
  expect(fmtDateTime("2026-09-05T10:00:00Z")).toMatch(/^05\/09\/2026,? \d{2}:\d{2}$/);
  for (const v of [undefined, null, ""]) {
    expect(fmtDate(v)).toBe("-");
    expect(fmtDateShort(v)).toBe("-");
    expect(fmtDateTime(v)).toBe("-");
    expect(toDateInputValue(v)).toBe("");
  }
  expect(fmtDate("garbage")).toBe("-");
});

test("status and payment labels", () => {
  expect(arabicStatus("in delivery")).toBe("قيد التوصيل");
  expect(arabicStatus("weird")).toBe("weird");
  expect(arabicStatus(undefined)).toBe("");
  expect(paymentLabel("Cash")).toBe("كاش");
  expect(paymentLabel("Credit")).toBe("بطاقة");
  expect(STATUSES.map((s) => s.value)).toEqual(["pending", "completed", "canceled", "ready for delivery", "in delivery", "uncollected payment"]);
  expect(STATUSES[0].label).toBe("قيد الانتظار");
});

test("waLink strips non-digits and one leading zero", () => {
  expect(waLink("0791234567")).toBe("https://wa.me/962791234567");
  expect(waLink("07-9123 4567")).toBe("https://wa.me/962791234567");
  expect(waLink(undefined)).toBe("https://wa.me/962");
});

test("money uses en-US thousands separators", () => {
  expect(money(1234.5)).toBe("1,234.50 JOD");
  expect(money(50)).toBe("50.00 JOD");
  for (const v of [null, undefined, "", "abc"]) expect(money(v)).toBe("0.00 JOD");
});

test("num never yields NaN", () => {
  expect(num("abc")).toBe("0");
});

test("waLink normalises international prefixes", () => {
  for (const p of ["0791234567", "+962 79 123 4567", "00962791234567", "791234567", "962791234567"]) expect(waLink(p)).toBe("https://wa.me/962791234567");
  for (const p of ["junk", "", "-", null]) expect(waLink(p)).toBe("https://wa.me/962");
});

test("waNational is the 9-digit number or empty", () => {
  expect(waNational("+962 79 123 4567")).toBe("791234567");
  expect(waNational("12345")).toBe("12345");
});
