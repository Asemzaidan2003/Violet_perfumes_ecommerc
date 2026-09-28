import { test } from "node:test";
import assert from "node:assert/strict";
import { contrast, deriveTheme, validateContrast, DEFAULT_THEME, HEX_RE } from "../backend/store/theme.js";

test("contrast: black on white is the maximum 21", () => {
  assert.equal(contrast("#000000", "#ffffff"), 21);
  assert.equal(contrast("#ffffff", "#000000"), 21);
});

test("contrast: same colour is 1", () => {
  assert.equal(contrast("#D4AF37", "#D4AF37"), 1);
});

test("deriveTheme is deterministic and returns all tokens as valid hex", () => {
  const a = deriveTheme(DEFAULT_THEME);
  const b = deriveTheme(DEFAULT_THEME);
  assert.deepEqual(a, b);
  for (const k of ["bg", "surface", "surface-2", "line", "text", "text-muted", "gold", "gold-strong", "gold-ink", "focus"]) {
    assert.match(a[k], HEX_RE, k);
  }
});

test("deriveTheme picks a gold-ink with the better contrast against accent", () => {
  const dark = deriveTheme({ ...DEFAULT_THEME, accent: "#FFFFFF" });
  assert.equal(contrast("#FFFFFF", dark["gold-ink"]) > 4, true);
});

test("validateContrast: the default theme passes", () => {
  assert.deepEqual(validateContrast(DEFAULT_THEME), []);
});

test("validateContrast: names each failing pair", () => {
  const failures = validateContrast({ bg: "#000000", surface: "#010101", text: "#020202", accent: "#030303" });
  assert.equal(failures.length, 3);
});
