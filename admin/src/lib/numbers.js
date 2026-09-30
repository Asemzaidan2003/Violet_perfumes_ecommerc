import { normalizeNumberInput } from "@/lib/cart";

const NUM = /^[+-]?(\d+\.?\d*|\.\d+)$/;

// Finite number or null. Accepts Arabic-Indic digits and decimal commas; blank/garbage -> null.
export function parseNumberInput(raw) {
  if (typeof raw === "number") return Number.isFinite(raw) ? raw : null;
  if (typeof raw !== "string") return null;
  const s = normalizeNumberInput(raw).trim();
  if (!NUM.test(s)) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

export function parseIntInput(raw) {
  const n = parseNumberInput(raw);
  return n === null ? null : Math.trunc(n);
}

export const formatForInput = (n) =>
  typeof n === "number" && Number.isFinite(n)
    ? n.toLocaleString("en-US", { useGrouping: false, maximumFractionDigits: 20 })
    : "";

// "a, b،c" -> ["a","b","c"]; trims, drops empties, dedupes preserving order.
export const splitList = (raw) =>
  [...new Set(String(raw ?? "").split(/[,،]/).map((s) => s.trim()).filter(Boolean))];
