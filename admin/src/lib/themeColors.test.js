import { QueryClient } from "@tanstack/react-query";
import { describe, expect, test } from "vitest";
import { contrast, contrastReport, DEFAULT_THEME, deriveTokens, isHex6, OVERRIDE_TOKENS } from "./themeColors.js";
import { putSettings, SETTINGS_KEY } from "../hooks/useSettings.js";
import { ApiError } from "./api.js";

describe("themeColors", () => {
  test("contrast", () => {
    expect(contrast("#000000", "#FFFFFF")).toBeCloseTo(21, 5);
    expect(contrast("#123456", "#123456")).toBeCloseTo(1, 5);
  });
  test("default theme is legible", () => {
    expect(contrastReport(DEFAULT_THEME).every((r) => r.ok)).toBe(true);
  });
  test("near-black colours fail all three pairs with the Arabic labels", () => {
    const r = contrastReport({ bg: "#000000", surface: "#010101", text: "#020202", accent: "#030303" });
    expect(r.filter((x) => !x.ok).map((x) => x.label)).toEqual(["النص على الخلفية", "النص على السطح", "لون التمييز على الخلفية"]);
  });
  test("deriveTokens is deterministic with hex and rgb() shapes", () => {
    const t = deriveTokens(DEFAULT_THEME);
    expect(deriveTokens(DEFAULT_THEME)).toEqual(t);
    for (const k of ["surface-2", "line", "text-muted", "gold-strong", "focus", "gold-ink"]) expect(isHex6(t[k])).toBe(true);
    expect(t["bg-glass"]).toBe("rgb(14 12 10 / 0.82)");
  });
  test("12 override tokens", () => {
    expect(OVERRIDE_TOKENS).toHaveLength(12);
  });
});

describe("putSettings", () => {
  const qc = () => { const c = new QueryClient(); c.setQueryData(SETTINGS_KEY, { store_name: "قديم" }); return c; };
  test("success writes the returned object into the cache", async () => {
    const c = qc();
    const out = await putSettings(c, { store_name: "جديد" }, async () => ({ data: { store_name: "جديد" } }));
    expect(out).toEqual({ store_name: "جديد" });
    expect(c.getQueryData(SETTINGS_KEY)).toEqual({ store_name: "جديد" });
  });
  test("failure keeps the cache and throws", async () => {
    const c = qc();
    await expect(putSettings(c, {}, async () => { throw new ApiError(400, "رقم واتساب غير صالح"); })).rejects.toThrow("رقم واتساب غير صالح");
    expect(c.getQueryData(SETTINGS_KEY)).toEqual({ store_name: "قديم" });
  });
  test("a second call while one is running is ignored", async () => {
    const c = qc();
    let calls = 0;
    let release;
    const slow = () => { calls += 1; return new Promise((r) => { release = () => r({ data: { store_name: "x" } }); }); };
    const first = putSettings(c, {}, slow);
    expect(await putSettings(c, {}, slow)).toBeNull();
    release();
    await first;
    expect(calls).toBe(1);
  });
});
