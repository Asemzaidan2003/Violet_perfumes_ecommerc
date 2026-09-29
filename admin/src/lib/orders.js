import { normalizeNumberInput } from "@/lib/cart";

const DASH = "-";
const day = (d) => { const t = d ? new Date(d) : null; return t && !Number.isNaN(t.getTime()) ? t : null; };
const startOfDay = (t) => new Date(t.getFullYear(), t.getMonth(), t.getDate());
// "YYYY-MM-DD" (date input) -> local midnight; null when blank or malformed.
const dateInput = (s) => { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s ?? ""); return m ? new Date(+m[1], +m[2] - 1, +m[3]) : null; };

export function resolveCustomer(order, customersById) {
  const linked = (order?.customer_id && customersById?.[order.customer_id]) || null;
  if (order?.source === "online") {
    return { name: order.delivery?.name || linked?.name || DASH, phone: order.delivery?.phone || linked?.phone || DASH };
  }
  return { name: linked?.name || DASH, phone: linked?.phone || DASH };
}

export const isUnconfirmed = (o) => o?.stock_deducted === false && o?.status !== "canceled";

export function isToday(order, now = new Date()) {
  const t = day(order?.createdAt);
  return !!t && startOfDay(t).getTime() === startOfDay(now).getTime();
}

// AND of every filter set. `today: true` limits to `now`'s local day (the page default view).
export function filterOrders(orders, { status, payment, from, to, query, today } = {}, customersById, now = new Date()) {
  const lo = dateInput(from);
  const hi = dateInput(to);
  const hiEnd = hi && new Date(hi.getFullYear(), hi.getMonth(), hi.getDate() + 1); // exclusive: whole `to` day
  const q = normalizeNumberInput(String(query ?? "")).trim().toLowerCase();
  return (orders ?? []).filter((o) => {
    if (today && !isToday(o, now)) return false;
    if (status === "unconfirmed" ? !isUnconfirmed(o) : status && o.status !== status) return false;
    if (payment && o.payment_method !== payment) return false;
    if (lo || hi) {
      const t = day(o.createdAt);
      if (!t || (lo && t < lo) || (hiEnd && t >= hiEnd)) return false;
    }
    if (q) {
      const c = resolveCustomer(o, customersById);
      if (!c.name.toLowerCase().includes(q) && !c.phone.includes(q)) return false;
    }
    return true;
  });
}

export function orderTotals(list) {
  let sales = 0, profit = 0;
  for (const o of list ?? []) {
    sales += Number(o.final_total) || 0;
    if (o.status === "completed") profit += Number(o.total_profit) || 0;
  }
  return { sales, profit };
}
