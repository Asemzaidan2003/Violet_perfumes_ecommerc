import { test, expect, vi } from "vitest";
import { planResize, pickEncoding, uploadImage, MAX_BYTES } from "./upload.js";

test("planResize never upscales, keeps aspect and rounds", () => {
  expect(planResize(4000, 2000, 1400)).toEqual({ w: 1400, h: 700 });
  expect(planResize(2000, 4000, 1400)).toEqual({ w: 700, h: 1400 });
  expect(planResize(800, 600, 1400)).toEqual({ w: 800, h: 600 });
  expect(planResize(1400, 900, 1400)).toEqual({ w: 1400, h: 900 });
  expect(planResize(1000, 333, 480)).toEqual({ w: 480, h: 160 });
  expect(planResize(5000, 1, 480)).toEqual({ w: 480, h: 1 });
});

test("pickEncoding prefers webp then jpeg", () => {
  expect(pickEncoding(true)).toEqual({ type: "image/webp", quality: 0.85 });
  expect(pickEncoding(false)).toEqual({ type: "image/jpeg", quality: 0.85 });
});

const file = (type, size = 10) => ({ type, size, name: "a" });
const blob = (type) => ({ type });
const ok = (data) => ({ ok: true, json: async () => ({ data }) });

test("uploadImage rejects wrong type and oversized files before any request", async () => {
  const fetchImpl = vi.fn();
  await expect(uploadImage(file("image/svg+xml"), { deps: { fetchImpl } })).rejects.toThrow("JPEG");
  await expect(uploadImage(file("image/png", MAX_BYTES + 1), { deps: { fetchImpl } })).rejects.toThrow("3");
  expect(fetchImpl).not.toHaveBeenCalled();
});

test("uploadImage posts the full image then the thumb, with the blob content type", async () => {
  const calls = [];
  const close = vi.fn();
  const deps = {
    bitmap: async () => ({ width: 3000, height: 2000, close }),
    encode: async (_b, maxEdge) => blob(maxEdge === 480 ? "image/jpeg" : "image/webp"),
    fetchImpl: async (url, init) => {
      calls.push([url, init.method, init.headers["Content-Type"], init.body.type]);
      return ok({ id: "abc", url: "/img/abc.webp", thumb: "/img/abc-480.webp" });
    },
  };
  const out = await uploadImage(file("image/png"), { kind: "banner", deps });
  expect(out).toEqual({ id: "abc", url: "/img/abc.webp", thumb: "/img/abc-480.webp" });
  expect(calls).toEqual([
    ["/api/uploads?kind=banner", "POST", "image/webp", "image/webp"],
    ["/api/uploads/abc/thumb", "POST", "image/jpeg", "image/jpeg"],
  ]);
  expect(close).toHaveBeenCalled();
});

test("uploadImage surfaces the server message or the Arabic fallback", async () => {
  const base = { bitmap: async () => ({ width: 1, height: 1, close() {} }), encode: async () => blob("image/webp") };
  const bad = (body) => ({ ...base, fetchImpl: async () => ({ ok: false, json: async () => body }) });
  await expect(uploadImage(file("image/png"), { deps: bad({ message: "نوع الملف غير مدعوم" }) })).rejects.toThrow("نوع الملف غير مدعوم");
  await expect(uploadImage(file("image/png"), { deps: bad({}) })).rejects.toThrow("فشل رفع الصورة");
});
