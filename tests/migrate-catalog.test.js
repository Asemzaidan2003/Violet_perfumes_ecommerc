import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import mongoose from "mongoose";
import { startTestApp } from "./helpers.js";
import { migrateCatalog } from "../scripts/migrate-catalog.js";

let t, db, backupDir;
before(async () => {
  t = await startTestApp();
  db = mongoose.connection.db;
  backupDir = fs.mkdtempSync(path.join(os.tmpdir(), "nsamat-backup-"));
  await db.collection("oils").insertOne({ id: "OIL1", oil_name: "O", oil_cost: 1, oil_quantity: 10 });
  await db.collection("products").insertMany([
    { p_name: "A", p_category: "Men", oil_id: "OIL1", size_list: [{ size: "10ml", price: 5 }, { size: "10", price: 6 }] },
    { p_name: "B", p_category: " women", oil_id: "OIL1", size_list: [{ size: "30", price: 9 }] },
    { p_name: "C", p_category: "منزلي", oil_id: "OIL1", size_list: [{ size: "100", price: 7 }] },
    { p_name: "D", p_category: "Defusers", oil_id: "OIL1", size_list: [{ size: "8", price: 3 }] },
    { p_name: "test", p_category: "test", oil_id: "OIL1", status: "available", size_list: [{ size: "100ml", price: 1 }] },
    { p_name: "E", p_category: "كيالي سباركلينغ", oil_id: "MISSING", size_list: [{ size: "abc", price: 2 }] },
  ]);
  await db.collection("customers").insertMany([
    { name: "X", phone: "+962 79 123 4567" },
    { name: "Y", phone: "0781234567" },
    { name: "Z", phone: "12" },
  ]);
});
after(() => t.close());

const snapshot = async () => JSON.stringify(await Promise.all([
  db.collection("products").find().sort({ p_name: 1 }).toArray(),
  db.collection("customers").find().sort({ name: 1 }).toArray(),
]));

test("dry run reports but changes nothing", async () => {
  const before = await snapshot();
  const report = await migrateCatalog(db, { apply: false, backupDir });
  assert.ok(report.changes.length > 0);
  assert.equal(await snapshot(), before);
  assert.equal(fs.readdirSync(backupDir).length, 0);
});

test("--apply migrates, backs up, and is idempotent", async () => {
  const report = await migrateCatalog(db, { apply: true, backupDir, now: new Date("2026-09-25T10:20:30Z") });
  const P = db.collection("products");
  const byName = async (n) => P.findOne({ p_name: n });
  assert.deepEqual((await byName("A")).size_list.map((s) => s.size), ["10"], "duplicate after normalisation keeps the first");
  assert.equal((await byName("A")).size_list[0].price, 5);
  assert.equal((await byName("B")).p_category, "Women");
  assert.equal((await byName("C")).p_category, "Home");
  assert.equal((await byName("D")).p_category, "Car");
  assert.equal((await byName("test")).status, "discontinued");
  assert.equal((await byName("test")).p_category, "Unisex");
  assert.equal((await byName("E")).p_category, "Unisex");
  const C = db.collection("customers");
  assert.equal((await C.findOne({ name: "X" })).phone, "0791234567");
  assert.equal((await C.findOne({ name: "Z" })).phone, "12", "unparseable phones are left alone");
  const review = report.review.join("\n");
  assert.match(review, /كيالي سباركلينغ/);
  assert.match(review, /MISSING/);
  assert.match(review, /abc/);
  assert.match(review, /12/);
  const files = fs.readdirSync(backupDir).sort();
  assert.deepEqual(files, ["customers-20260925-102030.json", "products-20260925-102030.json"]);
  const docs = mongoose.mongo.BSON.EJSON.parse(fs.readFileSync(path.join(backupDir, files[1]), "utf8"));
  assert.equal(docs.length, 6);
  assert.ok(docs[0]._id instanceof mongoose.mongo.ObjectId, "EJSON keeps ObjectIds");

  const again = await migrateCatalog(db, { apply: true, backupDir: fs.mkdtempSync(path.join(os.tmpdir(), "nb2-")) });
  assert.equal(again.changes.length, 0);
});
