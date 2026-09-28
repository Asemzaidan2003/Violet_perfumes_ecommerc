import { test } from "node:test";
import assert from "node:assert/strict";
import { contrast, deriveTheme, validateContrast, DEFAULT_THEME, HEX_RE, TOKEN_RE } from "../backend/store/theme.js";

// The owner's saved light theme (bg #fff, surface #ebebeb, text #000, accent #a27b44).
const LIGHT_THEME = { bg: "#ffffff", surface: "#ebebeb", text: "#000000", accent: "#a27b44" };

// WCAG relative luminance of a `rgb(r g b / a)` string's r,g,b (alpha ignored — same formula as theme.js).
function rgbLuminance(rgbStr) {
  const [r, g, b] = rgbStr.match(/rgb\((\d+) (\d+) (\d+)/).slice(1).map(Number);
  const lin = (c) => { const v = c / 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

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

test("deriveTheme(light theme): every token present and passes TOKEN_RE, header background is light", () => {
  const tokens = deriveTheme(LIGHT_THEME);
  for (const k of ["bg", "surface", "surface-2", "line", "text", "text-muted", "gold", "gold-strong", "gold-ink", "focus", "bg-glass", "glow-gold"]) {
    assert.ok(k in tokens, `missing token ${k}`);
    assert.match(tokens[k], TOKEN_RE, k);
  }
  // The header uses --bg-glass; with the light theme its background must be light, not the old hard-coded dark glass.
  assert.ok(rgbLuminance(tokens["bg-glass"]) > 0.8, "bg-glass should be light for a light theme");
});
