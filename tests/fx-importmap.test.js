// Task 3: the import map's rendered bytes must hash to exactly the CSP's sha256, and the vendored
// three.js files must be served, immutable, from /vendor/three@<version>/.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { startTestApp } from "./helpers.js";
import Oil from "../backend/models/oil.model.js";
import Bottle from "../backend/models/bottle.model.js";
import Product from "../backend/models/product.model.js";
import { THREE_VERSION, IMPORT_MAP_HASH } from "../backend/store/importmap.js";

let t;
let productId;

before(async () => {
  t = await startTestApp();
  await Oil.create({ id: "OIL1", oil_name: "Oud", oil_cost: 1, oil_quantity: 100 });
  await Bottle.create({ name: "B30", capacity: 30, cost: 1, quantity: 5 });
  const p = await Product.create({
    p_name: "عطر الاختبار", p_image: ".", p_category: "Men", oil_id: "OIL1",
    oil_percentage: 20, alcohol_percentage: 80, size_list: [{ size: "30", price: 20 }],
  });
  productId = String(p._id);
});
after(() => t.close());

test("the rendered import map's sha256 equals the CSP hash", async () => {
  const res = await fetch(`${t.url}/p/${productId}`);
  assert.equal(res.status, 200);
  const csp = res.headers.get("content-security-policy");
  assert.ok(csp?.includes(IMPORT_MAP_HASH), "CSP script-src carries the import map hash");

  const body = await res.text();
  const match = body.match(/<script type="importmap">([\s\S]*?)<\/script>/);
  assert.ok(match, "an importmap script tag is rendered");
  const rendered = match[1];
  const hash = `'sha256-${createHash("sha256").update(rendered, "utf8").digest("base64")}'`;
  assert.equal(hash, IMPORT_MAP_HASH, "the rendered bytes hash to exactly the CSP's hash");

  // First element in <head> after <meta charset>.
  const headStart = body.indexOf("<head>");
  const charsetIdx = body.indexOf("<meta charset=", headStart);
  const importmapIdx = body.indexOf("<script type=\"importmap\">", headStart);
  assert.ok(charsetIdx > -1 && importmapIdx > charsetIdx, "importmap follows <meta charset>");
  const between = body.slice(charsetIdx + '<meta charset="utf-8">'.length, importmapIdx).trim();
  assert.equal(between, "", "importmap is the first element in <head> after <meta charset>");
});

test("vendored three.js is served, immutable, at /vendor/three@<version>/", async () => {
  const res = await fetch(`${t.url}/vendor/three@${THREE_VERSION}/build/three.module.js`);
  assert.equal(res.status, 200);
  assert.match(res.headers.get("cache-control") || "", /immutable/);

  const orbit = await fetch(`${t.url}/vendor/three@${THREE_VERSION}/examples/jsm/controls/OrbitControls.js`);
  assert.equal(orbit.status, 200);

  const room = await fetch(`${t.url}/vendor/three@${THREE_VERSION}/examples/jsm/environments/RoomEnvironment.js`);
  assert.equal(room.status, 200);
});
