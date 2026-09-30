import { describe, expect, test } from "vitest";
import { buildCouponBody, buildPlacementBody, liveStatus, scheduleText, slotOf, SLOTS, storeLinkFor, validateCoupon, validatePlacement } from "./slots.js";

const NOW = new Date("2026-09-29T12:00:00.000Z");
const base = { slot: "announcement", title: "عرض", subtitle: "", image: "", link: "", cta: "", theme: "dark", category: "", family: "", starts: "", ends: "", sort: "0", active: true };

describe("slots", () => {
  test("eight slots, image and target flags", () => {
    expect(SLOTS).toHaveLength(8);
    expect(slotOf("hero").imageRequired).toBe(true);
    expect(slotOf("grid_tile").targeted).toBe(true);
    expect(slotOf("announcement").imageRequired).toBe(false);
  });
  test("liveStatus edges", () => {
    expect(liveStatus({ active: false }, NOW)).toBe("متوقف");
    expect(liveStatus({ active: true, starts_at: "2026-09-29T12:00:01.000Z" }, NOW)).toBe("مجدول");
    expect(liveStatus({ active: true, starts_at: "2026-09-29T12:00:00.000Z" }, NOW)).toBe("مباشر");
    expect(liveStatus({ active: true, ends_at: "2026-09-29T12:00:00.000Z" }, NOW)).toBe("منتهي");
    expect(liveStatus({ active: true, ends_at: "2026-09-29T12:00:01.000Z" }, NOW)).toBe("مباشر");
    expect(liveStatus({ active: true }, NOW)).toBe("مباشر");
  });
  test("storeLinkFor", () => {
    expect(storeLinkFor({ slot: "product_promo" })).toBe("/offers");
    expect(storeLinkFor({ slot: "grid_tile", target: { category: "men", family: "oud" } })).toBe("/c/men");
    expect(storeLinkFor({ slot: "collection_banner", target: { family: "oud" } })).toBe("/family/oud");
    expect(storeLinkFor({ slot: "grid_tile", target: {} })).toBe("/c/men");
    expect(storeLinkFor({ slot: "hero" })).toBe("/");
  });
  test("scheduleText", () => {
    expect(scheduleText({})).toBe("بلا جدولة");
    expect(scheduleText({ starts_at: "2026-09-29T15:00:00.000Z" })).toMatch(/→ —$/);
    expect(scheduleText({ ends_at: "2026-09-29T15:00:00.000Z" })).toMatch(/^— →/);
    expect(scheduleText({ starts_at: "2026-09-29T15:00:00.000Z", ends_at: "2026-09-30T15:00:00.000Z" })).not.toMatch(/—/);
  });
});

describe("placement payload", () => {
  test("non-targeted slots send an empty target, targeted send only chosen fields ({} when both All)", () => {
    expect(buildPlacementBody({ ...base, category: "men" }).target).toEqual({});
    expect(buildPlacementBody({ ...base, slot: "grid_tile", image: "https://x.com/a.png", category: "men" }).target).toEqual({ category: "men" });
    expect(buildPlacementBody({ ...base, slot: "grid_tile", image: "https://x.com/a.png" }).target).toEqual({});
  });
  test("Amman-time windows become ISO", () => {
    const b = buildPlacementBody({ ...base, starts: "2026-09-29T18:00", ends: "" });
    expect(b.starts_at).toBe("2026-09-29T15:00:00.000Z");
    expect(b.ends_at).toBeNull();
  });
  test("validation messages", () => {
    expect(validatePlacement(base)).toEqual({});
    expect(validatePlacement({ ...base, title: " " }).title).toBeTruthy();
    expect(validatePlacement({ ...base, slot: "hero" }).image).toBe("الصورة مطلوبة لهذا الموضع");
    expect(validatePlacement({ ...base, slot: "hero", image: "http://x.com/a.png" }).image).toBe("رابط صورة غير صالح");
    expect(validatePlacement({ ...base, link: "javascript:alert(1)" }).link).toBeTruthy();
    expect(validatePlacement({ ...base, link: "/c/men" }).link).toBeUndefined();
    expect(validatePlacement({ ...base, starts: "2026-09-29T18:00", ends: "2026-09-29T18:00" }).ends).toBe("تاريخ الانتهاء يجب أن يكون بعد البداية");
  });
});

describe("coupon payload", () => {
  const c = { code: "TEST20", type: "percent", value: "20", min: "", starts: "", ends: "", max: "", active: true };
  test("valid coupon and body (code only on create)", () => {
    expect(validateCoupon(c)).toEqual({});
    expect(buildCouponBody(c)).toMatchObject({ code: "TEST20", type: "percent", value: 20, min_subtotal: 0, max_uses: 0, active: true });
    expect(buildCouponBody(c, { edit: true }).code).toBeUndefined();
  });
  test("type/value validation runs on every save", () => {
    expect(validateCoupon({ ...c, value: "150" }).value).toBeTruthy();
    expect(validateCoupon({ ...c, type: "fixed", value: "150" }).value).toBeUndefined();
    expect(validateCoupon({ ...c, value: "0" }).value).toBeTruthy();
    expect(validateCoupon({ ...c, value: "٢٠" }).value).toBeUndefined();
    expect(validateCoupon({ ...c, code: "a b" }).code).toBeTruthy();
    expect(validateCoupon({ ...c, code: "a b" }, { edit: true }).code).toBeUndefined();
    expect(validateCoupon({ ...c, max: "1.5" }).max).toBeTruthy();
    expect(validateCoupon({ ...c, min: "-1" }).min).toBeTruthy();
  });
});
