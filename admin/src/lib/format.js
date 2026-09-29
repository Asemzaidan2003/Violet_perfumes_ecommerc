export const money = (n) => `${(Number(n) || 0).toFixed(2)} JOD`;
export const shortId = (id) => String(id ?? "").slice(-6).toUpperCase();

const dash = (d) => { const t = d ? new Date(d) : null; return t && !Number.isNaN(t.getTime()) ? t : null; };
const p2 = (n) => String(n).padStart(2, "0");

export const num = (n) => Number(n || 0).toLocaleString("en-US");
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

export const waLink = (phone) => `https://wa.me/962${String(phone ?? "").replace(/\D/g, "").replace(/^0/, "")}`;

export const CHART_COLORS = {
  brand: "#0c6e63", brandDark: "#0a564d", brandSoft: "#7fbdb5", amber: "#e0a530", blue: "#2b52a3",
  teal: "#1c7f8c", red: "#dc3545", slate: "#9aa3ae",
  palette: ["#0c6e63", "#2b52a3", "#e0a530", "#1c7f8c", "#dc3545", "#935b00", "#52585f", "#7fbdb5"],
};
