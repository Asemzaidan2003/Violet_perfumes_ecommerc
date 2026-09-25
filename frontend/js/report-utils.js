// Shared helpers for the reporting/dashboard pages.
const baseURL = "/api";

const ARABIC_STATUS = {
  pending: "قيد الانتظار",
  completed: "مكتمل",
  canceled: "ملغي",
  "ready for delivery": "جاهز للتوصيل",
  "in delivery": "قيد التوصيل",
  "uncollected payment": "دفعة غير مستلمة",
};

const STATUS_CLASS = {
  pending: "status-pending",
  completed: "status-completed",
  canceled: "status-canceled",
  "ready for delivery": "status-ready-for-delivery",
  "in delivery": "status-in-delivery",
  "uncollected payment": "status-uncollected-payment",
};

const CHART_COLORS = {
  brand: "#0c6e63",
  brandDark: "#0a564d",
  brandSoft: "#7fbdb5",
  amber: "#e0a530",
  blue: "#2b52a3",
  teal: "#1c7f8c",
  red: "#dc3545",
  slate: "#9aa3ae",
  palette: ["#0c6e63", "#2b52a3", "#e0a530", "#1c7f8c", "#dc3545", "#935b00", "#52585f", "#7fbdb5"],
};

function money(n) {
  const v = Number(n) || 0;
  return `${v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} JOD`;
}

function num(n) {
  return Number(n || 0).toLocaleString("en-US");
}

function pct(n) {
  const v = Number(n) || 0;
  const sign = v > 0 ? "+" : "";
  return `${sign}${v.toFixed(1)}%`;
}

function trendClass(n) {
  if (n > 0) return "up";
  if (n < 0) return "down";
  return "flat";
}

function trendArrow(n) {
  if (n > 0) return "▲";
  if (n < 0) return "▼";
  return "―";
}

function arabicStatus(status) {
  return ARABIC_STATUS[status] || status;
}

function statusClass(status) {
  return STATUS_CLASS[status] || "";
}

function fmtDate(d) {
  return new Date(d).toLocaleDateString("en-GB");
}

function fmtDateShort(isoDay) {
  // isoDay looks like "2026-07-20"
  const [, m, d] = isoDay.split("-");
  return `${d}/${m}`;
}

async function apiGet(path) {
  const res = await fetch(`${baseURL}${path}`);
  if (!res.ok) throw new Error(`Request failed: ${path} (${res.status})`);
  const json = await res.json();
  if (json.success === false) throw new Error(json.message || "Request failed");
  return json.data;
}

async function apiPut(path, body) {
  const res = await fetch(`${baseURL}${path}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Request failed: ${path} (${res.status})`);
  return res.json();
}

// Builds a small "YYYY-MM-DD" string from a Date, using local time (not UTC)
function toDateInputValue(d) {
  const x = new Date(d);
  const off = x.getTimezoneOffset();
  const local = new Date(x.getTime() - off * 60000);
  return local.toISOString().slice(0, 10);
}

// Client-side CSV export for whatever table rows are currently rendered
function exportTableToCsv(filename, headers, rows) {
  const escape = (v) => {
    const s = String(v ?? "");
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [headers.map(escape).join(",")];
  rows.forEach((row) => lines.push(row.map(escape).join(",")));
  const csv = "\uFEFF" + lines.join("\n"); // BOM so Excel opens Arabic text correctly
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
