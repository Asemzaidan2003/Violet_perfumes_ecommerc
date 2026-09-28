import { test } from "node:test";
import assert from "node:assert/strict";
import { parseTrustProxyHops } from "../backend/utils/trustProxy.js";

test("parseTrustProxyHops accepts non-negative integer strings", () => {
  assert.equal(parseTrustProxyHops("0"), 0);
  assert.equal(parseTrustProxyHops("1"), 1);
  assert.equal(parseTrustProxyHops("42"), 42);
});

test("parseTrustProxyHops rejects everything else instead of coercing to NaN", () => {
  assert.equal(parseTrustProxyHops(undefined), null);
  assert.equal(parseTrustProxyHops(""), null);
  assert.equal(parseTrustProxyHops("abc"), null);
  assert.equal(parseTrustProxyHops("-1"), null);
  assert.equal(parseTrustProxyHops("1.5"), null);
  assert.equal(parseTrustProxyHops(" 1"), null);
});
