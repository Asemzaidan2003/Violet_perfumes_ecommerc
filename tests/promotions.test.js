import { test } from "node:test";
import assert from "node:assert/strict";
import { effectivePrice, liveOffer } from "../backend/catalog/pricing.js";

const end = new Date("2026-10-01T00:00:00Z");
const p = { p_offer_percentage: 20, offer_ends_at: end };
const size = { size: "30", price: 10 };

test("offer is live until (not including) its end", () => {
  assert.equal(liveOffer(p, new Date(end.getTime() - 1)), 20);
  assert.equal(liveOffer(p, end), 0);
  assert.equal(effectivePrice(p, size, new Date(end.getTime() - 1)), 8);
  assert.equal(effectivePrice(p, size, end), 10);
});

test("offer without an end never expires; zero offer is no offer", () => {
  assert.equal(liveOffer({ p_offer_percentage: 15 }, new Date("2099-01-01")), 15);
  assert.equal(liveOffer({ p_offer_percentage: 0, offer_ends_at: end }, new Date(0)), 0);
});
