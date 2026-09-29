import { toDateInputValue } from "./format.js";

const shift = (now, days) => { const d = new Date(now.getFullYear(), now.getMonth(), now.getDate()); d.setDate(d.getDate() - days); return d; };

// Local-day YYYY-MM-DD ranges ending today; the week starts on Sunday.
export function presetRange(preset, now = new Date()) {
  const back = { today: 0, week: now.getDay(), "30d": 29, "90d": 89 }[preset];
  const from = preset === "month" ? new Date(now.getFullYear(), now.getMonth(), 1) : shift(now, back ?? 0);
  return { from: toDateInputValue(from), to: toDateInputValue(now) };
}

export const reportQuery = (params) => {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v) q.set(k, v);
  return q.toString();
};
