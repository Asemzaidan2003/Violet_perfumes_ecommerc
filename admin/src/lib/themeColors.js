// Display-side port of backend/store/theme.js (values only; the server stays the source of truth).
export const DEFAULT_THEME = { bg: "#0E0C0A", surface: "#17130F", text: "#F4EDE3", accent: "#D4AF37" };

// Same keys and order as the server whitelist (tests/admin-governorates.test.js keeps them equal).
export const OVERRIDE_TOKENS = [
  { key: "surface-2", label: "لون السطح الثانوي" },
  { key: "line", label: "لون الخطوط" },
  { key: "text-muted", label: "لون النص الباهت" },
  { key: "gold-strong", label: "لون التمييز الغامق" },
  { key: "gold-ink", label: "لون النص فوق التمييز" },
  { key: "cream", label: "لون الكريمي (قواعد البطاقات)" },
  { key: "ink", label: "لون الحبر" },
  { key: "ink-muted", label: "لون الحبر الباهت" },
  { key: "danger", label: "لون التنبيه (خطأ)" },
  { key: "success", label: "لون النجاح" },
  { key: "focus", label: "لون التركيز" },
  { key: "bg-glass", label: "خلفية الرأس (الشريط العلوي)" },
];

export const isHex6 = (v) => typeof v === "string" && /^#[0-9a-fA-F]{6}$/.test(v);

const toRgb = (hex) => { const n = parseInt(hex.slice(1), 16); return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 }; };
const toHex = ({ r, g, b }) => `#${[r, g, b].map((c) => Math.max(0, Math.min(255, Math.round(c))).toString(16).padStart(2, "0")).join("")}`;
const mix = (a, b, t) => { const A = toRgb(a), B = toRgb(b); return toHex({ r: A.r + (B.r - A.r) * t, g: A.g + (B.g - A.g) * t, b: A.b + (B.b - A.b) * t }); };
const luminance = (hex) => {
  const { r, g, b } = toRgb(hex);
  const lin = (c) => { const v = c / 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
};

export function contrast(a, b) {
  const L1 = luminance(a), L2 = luminance(b);
  const [hi, lo] = L1 >= L2 ? [L1, L2] : [L2, L1];
  return (hi + 0.05) / (lo + 0.05);
}

// Informational only: the server saves any valid hex colours.
export function contrastReport({ bg, surface, text, accent }) {
  return [
    { key: "text-bg", label: "النص على الخلفية", ratio: contrast(text, bg), threshold: 4.5 },
    { key: "text-surface", label: "النص على السطح", ratio: contrast(text, surface), threshold: 4.5 },
    { key: "accent-bg", label: "لون التمييز على الخلفية", ratio: contrast(accent, bg), threshold: 3 },
  ].map((r) => ({ ...r, ok: r.ratio >= r.threshold }));
}

// The tokens the server derives from the four colours (shown as "مشتق" for unset overrides).
export function deriveTokens({ bg, surface, text, accent }) {
  const { r, g, b } = toRgb(bg);
  const { r: ar, g: ag, b: ab } = toRgb(accent);
  return {
    "surface-2": mix(surface, "#FFFFFF", 0.12),
    line: mix(surface, "#FFFFFF", 0.2),
    "text-muted": mix(text, bg, 0.35),
    "gold-strong": mix(accent, "#FFFFFF", 0.2),
    focus: mix(accent, "#FFFFFF", 0.25),
    "gold-ink": contrast(accent, "#1A1206") >= contrast(accent, "#FFFDF8") ? "#1A1206" : "#FFFDF8",
    "bg-glass": `rgb(${r} ${g} ${b} / 0.82)`,
    "glow-gold": `rgb(${ar} ${ag} ${ab} / 0.16)`,
  };
}
