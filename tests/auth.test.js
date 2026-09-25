import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { startTestApp, loginAs } from "./helpers.js";
import { hashPassword, verifyPassword, createToken, verifyToken } from "../backend/middleware/auth.js";

let t;
before(async () => { t = await startTestApp(); });
after(() => t.close());

test("password hash round-trip", async () => {
  const h = await hashPassword("s3cret");
  assert.equal(await verifyPassword("s3cret", h), true);
  assert.equal(await verifyPassword("wrong", h), false);
  assert.equal(await verifyPassword("s3cret", "garbage"), false);
});

test("token rejects tampering and expiry", () => {
  const tok = createToken("abc", 0);
  assert.equal(verifyToken(tok, 1), "abc");
  assert.equal(verifyToken(tok.replace("abc", "abd"), 1), null);
  assert.equal(verifyToken(tok, 13 * 60 * 60 * 1000), null);
  assert.equal(verifyToken(undefined), null);
});

test("protected route needs a session", async () => {
  assert.equal((await fetch(`${t.url}/api/products`)).status, 401);
  const cookie = await loginAs(t.url);
  const res = await fetch(`${t.url}/api/products`, { headers: { cookie } });
  assert.notEqual(res.status, 401);
});

test("login rejects bad password and non-string input", async () => {
  await loginAs(t.url); // ensures admin exists
  const post = (body) => fetch(`${t.url}/api/auth/login`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
  });
  assert.equal((await post({ username: "admin", password: "nope" })).status, 401);
  assert.equal((await post({ username: { $ne: "" }, password: "x" })).status, 400);
});

test("me and logout", async () => {
  const cookie = await loginAs(t.url);
  const me = await fetch(`${t.url}/api/auth/me`, { headers: { cookie } });
  assert.deepEqual((await me.json()).data, { username: "admin", role: "admin" });
  const out = await fetch(`${t.url}/api/auth/logout`, { method: "POST", headers: { cookie } });
  assert.match(out.headers.get("set-cookie"), /nsamat_session=;/);
});

test("session cookie is HttpOnly and SameSite=Strict", async () => {
  const res = await fetch(`${t.url}/api/auth/login`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: "admin", password: "test-pass" }),
  });
  const c = res.headers.get("set-cookie");
  assert.match(c, /HttpOnly/);
  assert.match(c, /SameSite=Strict/);
});
