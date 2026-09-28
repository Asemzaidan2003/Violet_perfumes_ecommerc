import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { startTestApp, loginAs } from "./helpers.js";
import { validLink, isLive, forSlot, getLivePlacements } from "../backend/services/placements.service.js";

let t, cookie;
before(async () => {
  t = await startTestApp();
  cookie = await loginAs(t.url);
});
after(() => t.close());

const api = (path, method = "GET", body) =>
  fetch(`${t.url}/api${path}`, {
    method,
    headers: { cookie, "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

test("validLink accepts internal paths and https URLs, rejects the rest", () => {
  for (const l of ["/c/men", "/p/abc", "https://example.com/x"]) assert.equal(validLink(l), true, l);
  for (const l of ["javascript:alert(1)", "//evil.com", "/\\evil.com", "http://x.com", "data:text/html,x", " /c/men", ""]) {
    assert.equal(validLink(l), false, l);
  }
});

test("isLive: window edges, inactive, and no window", () => {
  const S = new Date("2026-01-10T00:00:00Z");
  const E = new Date("2026-01-20T00:00:00Z");
  const windowed = { active: true, starts_at: S, ends_at: E };
  assert.equal(isLive(windowed, new Date(S.getTime() - 1)), false);
  assert.equal(isLive(windowed, S), true);
  assert.equal(isLive(windowed, new Date(E.getTime() - 1)), true);
  assert.equal(isLive(windowed, E), false);
  assert.equal(isLive({ ...windowed, active: false }, S), false);
  assert.equal(isLive({ active: true }, new Date()), true);
});

test("forSlot: target filtering for collection_banner and grid_tile", () => {
  const placements = [
    { slot: "collection_banner", target: { category: "men" } },
    { slot: "collection_banner", target: {} },
    { slot: "grid_tile", target: { family: "oud" } },
    { slot: "hero", target: {} },
  ];
  assert.equal(forSlot(placements, "collection_banner", { category: "men" }).length, 2);
  assert.equal(forSlot(placements, "collection_banner", { category: "women" }).length, 1);
  assert.equal(forSlot(placements, "grid_tile", { family: "oud" }).length, 1);
  assert.equal(forSlot(placements, "grid_tile", { family: "musk" }).length, 0);
  assert.equal(forSlot(placements, "hero").length, 1);
});

// Runs before any other test creates placements, so the DB is genuinely empty at the start.
test("cache: invalidated on every admin write, without waiting 60s", async () => {
  assert.deepEqual(await getLivePlacements(), []);

  const created = await api("/placements", "POST", { slot: "announcement", title: "خصم اليوم" });
  assert.equal(created.status, 201);
  const { data: placement } = await created.json();
  assert.equal((await getLivePlacements()).length, 1);

  const put = await api(`/placements/${placement._id}`, "PUT", { active: false });
  assert.equal(put.status, 200);
  assert.equal((await getLivePlacements()).length, 0);

  const del = await api(`/placements/${placement._id}`, "DELETE");
  assert.equal(del.status, 200);
  assert.equal((await getLivePlacements()).length, 0);
});

test("POST /api/placements without auth is 401", async () => {
  const res = await fetch(`${t.url}/api/placements`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ slot: "hero", title: "x", image: "/img/aaaaaaaaaaaaaaaaaaaaaaaa.webp" }),
  });
  assert.equal(res.status, 401);
});

test("a valid hero placement (title + image) creates", async () => {
  const res = await api("/placements", "POST", {
    slot: "hero", title: "تخفيضات الشتاء", image: "/img/aaaaaaaaaaaaaaaaaaaaaaaa.webp",
  });
  assert.equal(res.status, 201);
  assert.equal((await res.json()).data.slot, "hero");
});

test("hero without an image is rejected with an Arabic message", async () => {
  const res = await api("/placements", "POST", { slot: "hero", title: "بدون صورة" });
  assert.equal(res.status, 400);
  const body = await res.json();
  assert.equal(body.success, false);
  assert.match(body.message, /الصورة/);
});

test("unknown slot is rejected", async () => {
  const res = await api("/placements", "POST", { slot: "popup", title: "x" });
  assert.equal(res.status, 400);
});

test("a hostile link is rejected", async () => {
  const res = await api("/placements", "POST", { slot: "announcement", title: "x", link: "javascript:alert(1)" });
  assert.equal(res.status, 400);
});

test("a title over 80 characters is rejected", async () => {
  const res = await api("/placements", "POST", { slot: "announcement", title: "a".repeat(81) });
  assert.equal(res.status, 400);
});

test("the announcement slot needs no image", async () => {
  const res = await api("/placements", "POST", { slot: "announcement", title: "إعلان بدون صورة" });
  assert.equal(res.status, 201);
});
