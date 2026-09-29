import { test, expect } from "vitest";
import { presetRange, reportQuery } from "./dates.js";

const now = new Date(2026, 8, 30, 15, 0); // Wednesday 2026-09-30, local

test("presets are local YYYY-MM-DD ranges ending today", () => {
  expect(presetRange("today", now)).toEqual({ from: "2026-09-30", to: "2026-09-30" });
  expect(presetRange("week", now)).toEqual({ from: "2026-09-27", to: "2026-09-30" }); // Sunday start
  expect(presetRange("month", now)).toEqual({ from: "2026-09-01", to: "2026-09-30" });
  expect(presetRange("30d", now)).toEqual({ from: "2026-09-01", to: "2026-09-30" });
  expect(presetRange("90d", now)).toEqual({ from: "2026-07-03", to: "2026-09-30" });
});

test("week on a Sunday starts today; ranges cross month boundaries", () => {
  expect(presetRange("week", new Date(2026, 8, 27)).from).toBe("2026-09-27");
  expect(presetRange("30d", new Date(2026, 0, 10)).from).toBe("2025-12-12");
});

test("reportQuery keeps only truthy values", () => {
  expect(reportQuery({ from: "2026-09-01", to: "", status: "completed", groupBy: undefined })).toBe("from=2026-09-01&status=completed");
  expect(reportQuery({ from: "a", to: "b", status: "all", groupBy: "week" })).toBe("from=a&to=b&status=all&groupBy=week");
  expect(reportQuery({})).toBe("");
});
