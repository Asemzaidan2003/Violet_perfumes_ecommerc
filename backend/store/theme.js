// Pure theme-derivation module: 4 admin-picked hex colours -> the full store.css token set.
// No I/O, no Mongo — safe to unit test directly.

export const HEX_RE = /^#[0-9a-fA-F]{6}$/;
// Only the exact `rgb(r g b / a)` shape deriveTheme() itself emits (integer 0-255 channels, alpha
// with up to 2 decimals) — never raw admin input, which stays gated by HEX_RE above.
const RGBA_RE = /^rgb\((25[0-5]|2[0-4]\d|1\d\d|\d{1,2}) (25[0-5]|2[0-4]\d|1\d\d|\d{1,2}) (25[0-5]|2[0-4]\d|1\d\d|\d{1,2}) \/ 0\.\d{1,2}\)$/;
export const TOKEN_RE = new RegExp(`(?:${HEX_RE.source})|(?:${RGBA_RE.source})`);

export const DEFAULT_THEME = { bg: "#0E0C0A", surface: "#17130F", text: "#F4EDE3", accent: "#D4AF37" };

const hexToRgb = (hex) => {
  const n = parseInt(hex.slice(1), 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
};

const rgbToHex = ({ r, g, b }) => `#${[r, g, b].map((c) => Math.max(0, Math.min(255, Math.round(c))).toString(16).padStart(2, "0")).join("")}`;

const mix = (a, b, t) => {
  const A = hexToRgb(a), B = hexToRgb(b);
  return rgbToHex({ r: A.r + (B.r - A.r) * t, g: A.g + (B.g - A.g) * t, b: A.b + (B.b - A.b) * t });
};

// WCAG relative luminance.
const luminance = (hex) => {
  const { r, g, b } = hexToRgb(hex);
  const lin = (c) => { const v = c / 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
};

// WCAG contrast ratio, 1..21.
export function contrast(a, b) {
  const L1 = luminance(a), L2 = luminance(b);
  const [hi, lo] = L1 >= L2 ? [L1, L2] : [L2, L1];
  return (hi + 0.05) / (lo + 0.05);
}

// Derive the full token set from the 4 admin colours (bg, surface, text, accent).
export function deriveTheme({ bg, surface, text, accent }) {
  const surface2 = mix(surface, "#FFFFFF", 0.12);
  const line = mix(surface, "#FFFFFF", 0.2);
  const textMuted = mix(text, bg, 0.35);
  const goldStrong = mix(accent, "#FFFFFF", 0.2);
  const focus = mix(accent, "#FFFFFF", 0.25);
  const goldInk = contrast(accent, "#1A1206") >= contrast(accent, "#FFFDF8") ? "#1A1206" : "#FFFDF8";
  const { r, g, b } = hexToRgb(bg);
  const bgGlass = `rgb(${r} ${g} ${b} / 0.82)`;
  const { r: ar, g: ag, b: ab } = hexToRgb(accent);
  const glowGold = `rgb(${ar} ${ag} ${ab} / 0.16)`;
  return {
    bg, surface, "surface-2": surface2, line, text, "text-muted": textMuted,
    gold: accent, "gold-strong": goldStrong, "gold-ink": goldInk, focus,
    "bg-glass": bgGlass, "glow-gold": glowGold,
  };
}

// Server-side save gate: pairs that must stay legible.
export function validateContrast({ bg, surface, text, accent }) {
  const failures = [];
  if (contrast(text, bg) < 4.5) failures.push("النص على الخلفية");
  if (contrast(text, surface) < 4.5) failures.push("النص على السطح");
  if (contrast(accent, bg) < 3) failures.push("لون التمييز على الخلفية");
  return failures;
}
