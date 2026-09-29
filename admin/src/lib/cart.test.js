import { test, expect } from "vitest";
import { normalizePhone } from "@store-shared/phone.js";
import {
  MAX_QTY, effectivePrice, bottlesFor, pickBottle, addToCart, setQuantity, setPrice, setBottle,
  removeLine, restoreLine, lineTotal, totals, cartProblems, buildOrderBody,
} from "./cart.js";

const NOW = new Date("2026-09-29T12:00:00Z");
const product = { _id: "p1", p_name: "عطر", p_image: "/img/a.png", p_offer_percentage: 0, size_list: [{ size: "30", price: 25 }, { size: "50", price: 40 }] };
const bottles = [
  { _id: "b1", name: "زجاجة 30 صغيرة", capacity: 30, quantity: 5 },
  { _id: "b2", name: "زجاجة 30 كبيرة", capacity: 30, quantity: 90 },
  { _id: "b3", name: "زجاجة 50", capacity: 50, quantity: 10 },
];

test("effectivePrice applies a live offer and ignores an expired one (end is exclusive)", () => {
  const offer = { ...product, p_offer_percentage: 20 };
  expect(effectivePrice(offer, offer.size_list[1], NOW)).toBe(32);
  expect(effectivePrice({ ...offer, offer_ends_at: "2026-09-29T12:00:00Z" }, offer.size_list[1], NOW)).toBe(40);
  expect(effectivePrice({ ...offer, offer_ends_at: "2026-09-29T12:00:01Z" }, offer.size_list[1], NOW)).toBe(32);
  expect(effectivePrice({ ...product, p_offer_percentage: 33 }, { size: "30", price: 10 }, NOW)).toBe(6.7);
});

test("bottles are matched by capacity and the fullest one is picked", () => {
  expect(bottlesFor(bottles, "30").map((b) => b._id)).toEqual(["b1", "b2"]);
  expect(pickBottle(bottles, "30")._id).toBe("b2");
  expect(pickBottle(bottles, "75")).toBeNull();
});

test("adding the same product and size again increases the quantity, capped at MAX_QTY", () => {
  let cart = addToCart([], product, product.size_list[0], bottles, NOW);
  expect(cart).toHaveLength(1);
  expect(cart[0]).toMatchObject({ key: "p1:30", quantity: 1, unitPrice: 25, bottleId: "b2", priceOverride: null });
  cart = addToCart(cart, product, product.size_list[0], bottles, NOW);
  expect(cart[0].quantity).toBe(2);
  cart = setQuantity(cart, "p1:30", MAX_QTY);
  expect(addToCart(cart, product, product.size_list[0], bottles, NOW)[0].quantity).toBe(MAX_QTY);
  expect(addToCart(cart, product, product.size_list[1], bottles, NOW)).toHaveLength(2);
});

test("quantity is a whole number between 1 and MAX_QTY", () => {
  const cart = addToCart([], product, product.size_list[0], bottles, NOW);
  expect(setQuantity(cart, "p1:30", 0)[0].quantity).toBe(1);
  expect(setQuantity(cart, "p1:30", -4)[0].quantity).toBe(1);
  expect(setQuantity(cart, "p1:30", 2.9)[0].quantity).toBe(2);
  expect(setQuantity(cart, "p1:30", "abc")[0].quantity).toBe(1);
  expect(setQuantity(cart, "p1:30", 5000)[0].quantity).toBe(MAX_QTY);
});

test("a price override that equals the normal price or is blank is dropped; negatives clamp to 0", () => {
  const cart = addToCart([], product, product.size_list[0], bottles, NOW);
  expect(setPrice(cart, "p1:30", "20")[0].priceOverride).toBe(20);
  expect(setPrice(cart, "p1:30", "25")[0].priceOverride).toBeNull();
  expect(setPrice(cart, "p1:30", "")[0].priceOverride).toBeNull();
  expect(setPrice(cart, "p1:30", "-3")[0].priceOverride).toBe(0);
  expect(setPrice(cart, "p1:30", "12.345")[0].priceOverride).toBe(12.35);
});

test("Arabic-Indic digits and decimal commas are read as the number the cashier typed", () => {
  const cart = addToCart([], product, product.size_list[0], bottles, NOW);
  expect(setPrice(cart, "p1:30", "٢٠")[0].priceOverride).toBe(20);
  expect(setPrice(cart, "p1:30", "۲۰")[0].priceOverride).toBe(20);
  expect(setPrice(cart, "p1:30", "٧٫٥")[0].priceOverride).toBe(7.5);
  expect(setPrice(cart, "p1:30", "7,5")[0].priceOverride).toBe(7.5);
  expect(setPrice(cart, "p1:30", "  ")[0].priceOverride).toBeNull();
  expect(setPrice(cart, "p1:30", "abc")[0].priceOverride).toBeNull();
  expect(setQuantity(cart, "p1:30", "٥")[0].quantity).toBe(5);
  expect(setQuantity(cart, "p1:30", "abc")[0].quantity).toBe(1);
});

test("whitespace-only price input means no override, never a free sale", () => {
  const cart = addToCart([], product, product.size_list[0], bottles, NOW);
  const modified = setPrice(cart, "p1:30", "   ");
  expect(modified[0].priceOverride).toBeNull();
  const body = buildOrderBody(modified, "c1");
  expect(body.products[0]).not.toHaveProperty("price");
});

test("totals use the override price and round to two decimals", () => {
  let cart = addToCart([], product, product.size_list[0], bottles, NOW);
  cart = setQuantity(cart, "p1:30", 3);
  cart = setPrice(cart, "p1:30", "7.35");
  expect(lineTotal(cart[0])).toBe(22.05);
  cart = addToCart(cart, product, product.size_list[1], bottles, NOW);
  expect(totals(cart)).toEqual({ items: 4, amount: 62.05 });
  expect(totals([])).toEqual({ items: 0, amount: 0 });
});

test("removing and restoring a line puts it back in place, once", () => {
  let cart = addToCart([], product, product.size_list[0], bottles, NOW);
  cart = addToCart(cart, product, product.size_list[1], bottles, NOW);
  const gone = cart[0];
  const after = removeLine(cart, gone.key);
  expect(after).toHaveLength(1);
  expect(restoreLine(after, gone, 0).map((l) => l.key)).toEqual(["p1:30", "p1:50"]);
  expect(restoreLine(restoreLine(after, gone, 0), gone, 0)).toHaveLength(2);
});

test("a size with no bottle of that capacity blocks checkout with a clear message", () => {
  const p = { ...product, size_list: [{ size: "75", price: 90 }] };
  const cart = addToCart([], p, p.size_list[0], bottles, NOW);
  expect(cart[0].bottleId).toBeNull();
  expect(cartProblems(cart, bottles)).toEqual([{ key: "p1:75", message: "لا توجد زجاجة بسعة 75 مل للسطر 1" }]);
  const fixed = setBottle(addToCart([], product, product.size_list[0], [], NOW), "p1:30", "b1");
  expect(cartProblems(fixed, bottles)).toEqual([]);
  expect(cartProblems(addToCart([], product, product.size_list[0], [], NOW), bottles)[0].message).toBe("اختر زجاجة للسطر 1");
});

test("the order body omits price unless the cashier edited it", () => {
  let cart = addToCart([], product, product.size_list[0], bottles, NOW);
  cart = setQuantity(cart, "p1:30", 2);
  expect(buildOrderBody(cart, "c1")).toEqual({
    products: [{ product_id: "p1", size: "30", quantity: 2, bottle_id: "b2" }],
    customer_id: "c1",
    payment_method: "Cash",
  });
  cart = setPrice(cart, "p1:30", "20");
  expect(buildOrderBody(cart, "c1", "Credit").products[0].price).toBe(20);
  expect(buildOrderBody(cart, "c1", "Credit").payment_method).toBe("Credit");
});

test("customer phones typed in Arabic digits or +962 normalise to the same number", () => {
  expect(normalizePhone("٠٧٩١٢٣٤٥٦٧")).toBe("0791234567");
  expect(normalizePhone("+962 79 123 4567")).toBe("0791234567");
  expect(normalizePhone("791234567")).toBe("0791234567");
});
