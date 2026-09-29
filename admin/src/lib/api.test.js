import { test, expect, vi, beforeEach } from "vitest";
import { api, ApiError, setUnauthorizedHandler, unwrap, listOf } from "./api.js";

const reply = (status, body) => vi.fn(async () => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } }));

beforeEach(() => { vi.unstubAllGlobals(); setUnauthorizedHandler(() => {}); });

test("returns the parsed body and sends same-origin credentials under /api", async () => {
  const f = reply(200, { success: true, data: [1] });
  vi.stubGlobal("fetch", f);
  expect(await api("/products")).toEqual({ success: true, data: [1] });
  expect(f.mock.calls[0][0]).toBe("/api/products");
  expect(f.mock.calls[0][1].credentials).toBe("same-origin");
});

test("posts JSON bodies with a content type", async () => {
  const f = reply(201, { _id: "c1" });
  vi.stubGlobal("fetch", f);
  await api("/customers", { method: "POST", body: { name: "س" } });
  expect(f.mock.calls[0][1].method).toBe("POST");
  expect(f.mock.calls[0][1].headers["Content-Type"]).toBe("application/json");
  expect(f.mock.calls[0][1].body).toBe(JSON.stringify({ name: "س" }));
});

test("throws ApiError carrying the server's message and status", async () => {
  vi.stubGlobal("fetch", reply(400, { success: false, message: "السطر 1: يرجى اختيار زجاجة" }));
  await expect(api("/orders", { method: "POST", body: {} })).rejects.toMatchObject({ name: "Error", status: 400, message: "السطر 1: يرجى اختيار زجاجة" });
});

test("a 401 calls the unauthorized handler, except for the login request", async () => {
  const handler = vi.fn();
  setUnauthorizedHandler(handler);
  vi.stubGlobal("fetch", reply(401, { message: "Unauthorized" }));
  await expect(api("/orders")).rejects.toBeInstanceOf(ApiError);
  expect(handler).toHaveBeenCalledTimes(1);
  await expect(api("/auth/login", { method: "POST", body: {} })).rejects.toBeInstanceOf(ApiError);
  expect(handler).toHaveBeenCalledTimes(1);
});

test("an unreadable error body still yields a friendly Arabic message", async () => {
  vi.stubGlobal("fetch", vi.fn(async () => new Response("<html>boom</html>", { status: 502 })));
  await expect(api("/orders")).rejects.toMatchObject({ status: 502, message: "تعذّر إكمال الطلب" });
});

test("unwrap handles enveloped, bare and missing data", () => {
  expect(unwrap({ data: [1, 2] })).toEqual([1, 2]);
  expect(unwrap([3])).toEqual([3]);
  expect(unwrap({ data: null })).toEqual([]);
  expect(unwrap(null)).toEqual([]);
});

test("listOf turns the server's 404 empty-list answer into []", async () => {
  vi.stubGlobal("fetch", reply(404, { success: false, message: "No products found" }));
  expect(await listOf("/products")()).toEqual([]);
  vi.stubGlobal("fetch", reply(500, { message: "Server error" }));
  await expect(listOf("/products")()).rejects.toMatchObject({ status: 500 });
});
