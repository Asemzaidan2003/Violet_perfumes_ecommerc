export const money = (n) => `${(Number(n) || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} JOD`;
export const shortId = (id) => String(id ?? "").slice(-6).toUpperCase();

export const dash = (d) => { const t = d ? new Date(d) : null; return t && !Number.isNaN(t.getTime()) ? t : null; };
const p2 = (n) => String(n).padStart(2, "0");

export const num = (n) => (Number(n) || 0).toLocaleString("en-US");
export const pct = (n) => { const v = Number(n) || 0; return `${v > 0 ? "+" : ""}${v.toFixed(1)}%`; };
export const trendClass = (n) => (Number(n) > 0 ? "up" : Number(n) < 0 ? "down" : "flat");
export const trendArrow = (n) => ({ up: "▲", down: "▼", flat: "―" })[trendClass(n)];

export const fmtDate = (d) => dash(d)?.toLocaleDateString("en-GB") ?? "-";
export const fmtDateShort = (s) => { const m = /^\d{4}-(\d{2})-(\d{2})/.exec(s ?? ""); return m ? `${m[2]}/${m[1]}` : "-"; };
export const fmtDateTime = (d) => { const t = dash(d); return t ? `${t.toLocaleDateString("en-GB")} ${p2(t.getHours())}:${p2(t.getMinutes())}` : "-"; };
export const toDateInputValue = (d) => { const t = dash(d); return t ? `${t.getFullYear()}-${p2(t.getMonth() + 1)}-${p2(t.getDate())}` : ""; };

export const STATUSES = [
  { value: "pending", label: "قيد الانتظار" },
  { value: "completed", label: "مكتمل" },
  { value: "canceled", label: "ملغي" },
  { value: "ready for delivery", label: "جاهز للتوصيل" },
  { value: "in delivery", label: "قيد التوصيل" },
  { value: "uncollected payment", label: "دفعة غير مستلمة" },
];
export const arabicStatus = (s) => STATUSES.find((x) => x.value === s)?.label ?? (s == null ? "" : String(s));
export const paymentLabel = (m) => ({ Cash: "كاش", Credit: "بطاقة" })[m] ?? (m == null ? "" : String(m));

// Digits only; drop a 00962 / 962 country prefix, then one national leading 0.
export const waNational = (phone) => String(phone ?? "").replace(/\D/g, "").replace(/^(00)?962/, "").replace(/^0/, "");
export const waLink = (phone) => `https://wa.me/962${waNational(phone)}`;

// Chart colours as light/dark pairs (dark variants stay readable on a dark card). CHART_PAIRS is the categorical order.
export const PAIR = {
  teal: { light: "#0c6e63", dark: "#2bb5a4" }, blue: { light: "#2b52a3", dark: "#7ea2f0" }, amber: { light: "#b7791f", dark: "#f0b94a" }, cyan: { light: "#1c7f8c", dark: "#5cc3d1" },
  red: { light: "#dc3545", dark: "#f07a86" }, brown: { light: "#935b00", dark: "#e09a4a" }, slate: { light: "#52585f", dark: "#a7b0ba" }, mint: { light: "#5b8f89", dark: "#9fd3cc" },
};
export const CHART_PAIRS = Object.values(PAIR);
export const n2 = (v) => Number(v) || 0;
// A usable product image: same-origin absolute path (not protocol-relative) or https. "." / empty mean none.
export const ownImage = (src) => typeof src === "string" && (/^\/(?!\/)/.test(src) || src.startsWith("https://"));
