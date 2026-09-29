import { test, expect } from "vitest";
import { resolveCustomer, isUnconfirmed, filterOrders, isToday, orderTotals } from "./orders.js";

const NOW = new Date(2026, 8, 29, 12, 0, 0); // local noon
const at = (y, m, d, h = 12, mi = 0, s = 0, ms = 0) => new Date(y, m - 1, d, h, mi, s, ms).toISOString();
const customers = { c1: { name: "Sara", phone: "0791111111" } };
const byId = customers;

test("resolveCustomer: pos uses the linked customer, missing gives dashes", () => {
  expect(resolveCustomer({ source: "pos", customer_id: "c1" }, byId)).toEqual({ name: "Sara", phone: "0791111111" });
  expect(resolveCustomer({ source: "pos", customer_id: "gone" }, byId)).toEqual({ name: "-", phone: "-" });
  expect(resolveCustomer({ source: "pos" }, byId)).toEqual({ name: "-", phone: "-" });
  expect(resolveCustomer({}, undefined)).toEqual({ name: "-", phone: "-" });
});

test("resolveCustomer: the online delivery snapshot wins, falling back per field", () => {
  const o = { source: "online", customer_id: "c1", delivery: { name: "Snap", phone: "0782222222" } };
  expect(resolveCustomer(o, byId)).toEqual({ name: "Snap", phone: "0782222222" });
  expect(resolveCustomer({ ...o, delivery: { name: "", phone: "" } }, byId)).toEqual({ name: "Sara", phone: "0791111111" });
  expect(resolveCustomer({ source: "online" }, byId)).toEqual({ name: "-", phone: "-" });
});

test("isUnconfirmed: stock_deducted false and not canceled only", () => {
  expect(isUnconfirmed({ stock_deducted: false, status: "pending" })).toBe(true);
  expect(isUnconfirmed({ stock_deducted: false, status: "canceled" })).toBe(false);
  expect(isUnconfirmed({ stock_deducted: true, status: "pending" })).toBe(false);
  expect(isUnconfirmed({ status: "pending" })).toBe(false);
});

test("isToday compares local calendar days across midnight", () => {
  expect(isToday({ createdAt: at(2026, 9, 29, 0, 0, 0) }, NOW)).toBe(true);
  expect(isToday({ createdAt: at(2026, 9, 29, 23, 59, 59, 999) }, NOW)).toBe(true);
  expect(isToday({ createdAt: at(2026, 9, 28, 23, 59, 59, 999) }, NOW)).toBe(false);
  expect(isToday({ createdAt: at(2026, 9, 30, 0, 0, 0) }, NOW)).toBe(false);
  expect(isToday({}, NOW)).toBe(false);
  expect(isToday({ createdAt: "garbage" }, NOW)).toBe(false);
});

const orders = [
  { _id: "1", source: "pos", customer_id: "c1", status: "completed", payment_method: "Cash", stock_deducted: true, createdAt: at(2026, 9, 29), final_total: 50, total_profit: 20 },
  { _id: "2", source: "online", status: "pending", payment_method: "Cash", stock_deducted: false, createdAt: at(2026, 9, 28, 23, 59, 59, 999), final_total: 30, total_profit: 0, delivery: { name: "Ali Zed", phone: "0781234567" } },
  { _id: "3", source: "pos", status: "canceled", payment_method: "Credit", stock_deducted: false, createdAt: at(2026, 9, 27), final_total: 10, total_profit: 4 },
  { _id: "4", source: "pos", status: "pending", payment_method: "Credit", stock_deducted: true, createdAt: at(2026, 9, 29, 8) , final_total: 5, total_profit: 1 },
];
const ids = (f) => filterOrders(orders, f, byId, NOW).map((o) => o._id);

test("filterOrders: no filters returns everything, today flag narrows to today", () => {
  expect(ids({})).toEqual(["1", "2", "3", "4"]);
  expect(ids({ today: true })).toEqual(["1", "4"]);
});

test("filterOrders: status, unconfirmed pseudo-status and payment", () => {
  expect(ids({ status: "completed" })).toEqual(["1"]);
  expect(ids({ status: "unconfirmed" })).toEqual(["2"]);
  expect(ids({ status: "canceled" })).toEqual(["3"]);
  expect(ids({ payment: "Credit" })).toEqual(["3", "4"]);
});

test("filterOrders: from/to use whole local days, both inclusive", () => {
  expect(ids({ from: "2026-09-28", to: "2026-09-28" })).toEqual(["2"]);
  expect(ids({ to: "2026-09-27" })).toEqual(["3"]);
  expect(ids({ from: "2026-09-29" })).toEqual(["1", "4"]);
  expect(ids({ from: "2026-09-28", to: "2026-09-29" })).toEqual(["1", "2", "4"]);
});

test("filterOrders: search by name (case-insensitive, resolved) and by Arabic-digit phone", () => {
  expect(ids({ query: "  sara " })).toEqual(["1"]);
  expect(ids({ query: "ALI" })).toEqual(["2"]);
  expect(ids({ query: "٠٧٨١٢٣" })).toEqual(["2"]);
  expect(ids({ query: "0791" })).toEqual(["1"]);
  expect(ids({ query: "nobody" })).toEqual([]);
});

test("filterOrders: filters combine with AND", () => {
  expect(ids({ payment: "Credit", status: "pending", today: true })).toEqual(["4"]);
  expect(ids({ payment: "Cash", status: "unconfirmed", query: "ali", from: "2026-09-28" })).toEqual(["2"]);
  expect(ids({ payment: "Credit", status: "unconfirmed" })).toEqual([]);
});

test("orderTotals: sales include canceled, profit only completed, missing fields are 0", () => {
  expect(orderTotals(orders)).toEqual({ sales: 95, profit: 20 });
  expect(orderTotals([{ status: "completed" }, {}])).toEqual({ sales: 0, profit: 0 });
  expect(orderTotals([])).toEqual({ sales: 0, profit: 0 });
});

test("filterOrders: search only rewrites digits, so punctuation in names still matches", () => {
  const list = [{ _id: "9", source: "online", delivery: { name: "Ali, Zed", phone: "0781234567" } }, { _id: "8", source: "online", delivery: { name: "Ali. Zed", phone: "0780000000" } }];
  const f = (query) => filterOrders(list, { query }, {}, NOW).map((o) => o._id);
  expect(f("Ali, Zed")).toEqual(["9"]);
  expect(f("Ali. Zed")).toEqual(["8"]);
  expect(f("۰۷۸۱۲")).toEqual(["9"]);
  expect(f("٠٧٨٠٠٠٠")).toEqual(["8"]);
});
