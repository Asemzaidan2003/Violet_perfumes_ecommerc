// Pure cart-store.js logic (line cap, malformed-line filtering). No browser: readCart/add touch
// localStorage/dispatchEvent/document, so this stubs the minimal surface cart-store.js calls —
// node:test itself has no DOM. Behaviour that needs a real form/page (remember-me clearing on
// uncheck) lives in tests/e2e/checkout.mjs instead.
import { test, before, beforeEach } from "node:test";
import assert from "node:assert/strict";

before(() => {
  const store = new Map();
  globalThis.localStorage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
  };
  globalThis.dispatchEvent = () => {};
  globalThis.document = { getElementById: () => null };
});

const { readCart, add, MAX_LINES, CART_KEY } = await import("../storefront/js/shared/cart-store.js");

beforeEach(() => localStorage.removeItem(CART_KEY));

test("readCart drops malformed lines but keeps well-formed ones", () => {
  localStorage.setItem(CART_KEY, JSON.stringify([
    { id: "a", size: "30", qty: 1 },
    { id: 5, size: "30", qty: 1 },       // id not a string
    { id: "b", size: null, qty: 1 },     // size not a string
    "not an object",
    null,
    42,
  ]));
  assert.deepEqual(readCart(), [{ id: "a", size: "30", qty: 1 }]);
});

test("readCart tolerates bad JSON and a non-array payload", () => {
  localStorage.setItem(CART_KEY, "{not json");
  assert.deepEqual(readCart(), []);
  localStorage.setItem(CART_KEY, JSON.stringify({ not: "an array" }));
  assert.deepEqual(readCart(), []);
});

test("add refuses a new distinct line past MAX_LINES but still tops up an existing one", () => {
  for (let i = 0; i < MAX_LINES; i++) assert.equal(add(`p${i}`, "30", 1), true);
  assert.equal(readCart().length, MAX_LINES);

  assert.equal(add("overflow", "30", 1), false, "the 21st distinct line is refused");
  assert.equal(readCart().length, MAX_LINES, "the cart is unchanged");

  assert.equal(add("p0", "30", 1), true, "an existing line can still grow past the line cap");
  assert.equal(readCart().find((l) => l.id === "p0" && l.size === "30").qty, 2);
});
