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
    // Object.prototype property name — must fall through to review, not resolve via the prototype chain.
    { p_name: "F", p_category: "constructor", oil_id: "OIL1", size_list: [{ size: "5", price: 2 }] },
  ]);
  await db.collection("customers").insertMany([
    { name: "X", phone: "+962 79 123 4567" },
    { name: "Y", phone: "0781234567" },
    { name: "Z", phone: "12" },
    // Three spellings of the same number, none matching X/Y/Z, so this group is exactly {Dup1, Dup2, Dup3}.
    { name: "Dup1", phone: "+962770001111" },
    { name: "Dup2", phone: "0770001111" },
    { name: "Dup3", phone: "00962 77 000 1111" },
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
  assert.equal((await byName("F")).p_category, "Unisex", "'constructor' is an inherited key, not an own one — must not resolve via the prototype chain");
  const C = db.collection("customers");
  assert.equal((await C.findOne({ name: "X" })).phone, "0791234567");
  assert.equal((await C.findOne({ name: "Z" })).phone, "12", "unparseable phones are left alone");
  const review = report.review.join("\n");
  assert.match(review, /كيالي سباركلينغ/);
  assert.match(review, /MISSING/);
  assert.match(review, /"abc"/);
  assert.match(review, /"12"/);
  assert.match(review, /"constructor"/);
  assert.match(
    review,
    /phone shared by 3 customers \(the POS lookup returns only the first\): 0770001111 —.*Dup1.*Dup2.*Dup3/,
    "all three normalised-duplicate customers are named in one line"
  );

  const files = fs.readdirSync(backupDir).sort();
  assert.deepEqual(files, [
    "customers-20260925-102030.json",
    "products-20260925-102030.json",
    "report-20260925-102030.txt",
  ]);
  const docs = mongoose.mongo.BSON.EJSON.parse(fs.readFileSync(path.join(backupDir, files[1]), "utf8"));
  assert.equal(docs.length, 7);
  assert.ok(docs[0]._id instanceof mongoose.mongo.ObjectId, "EJSON keeps ObjectIds");

  const reportText = fs.readFileSync(path.join(backupDir, "report-20260925-102030.txt"), "utf8");
  assert.match(reportText, /Women/, "the crash-safe report lists the planned changes");
  assert.match(reportText, /constructor/, "the crash-safe report lists the review lines");
  assert.match(reportText, /products-20260925-102030\.json/, "the crash-safe report lists the backup paths");
  assert.match(reportText, /customers-20260925-102030\.json/);

  // The first run's applied count must equal the number of documents actually planned for update
  // (not the number of field-level changes — one document can have several changed fields).
  const plannedDocs = new Set(report.changes.map((c) => `${c.collection}:${c._id}`)).size;
  assert.equal(report.applied, plannedDocs);
  assert.equal(report.skipped, 0);

  const backupDir2 = fs.mkdtempSync(path.join(os.tmpdir(), "nb2-"));
  const again = await migrateCatalog(db, { apply: true, backupDir: backupDir2 });
  assert.equal(again.changes.length, 0);
  assert.equal(again.applied, 0);
  assert.equal(fs.readdirSync(backupDir2).length, 0, "nothing to apply means no backup files are written");
});

test("--apply never overwrites an existing backup (throws before updating)", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "nsamat-collide-"));
  const now = new Date("2026-01-01T00:00:00Z");
  await db.collection("products").insertOne({ p_name: "Collide1", p_category: "men", oil_id: "OIL1", size_list: [{ size: "5", price: 1 }] });
  const first = await migrateCatalog(db, { apply: true, backupDir: dir, now });
  assert.ok(first.applied > 0);

  // A second run in the same second, same backupDir: the backup filenames collide.
  await db.collection("products").insertOne({ p_name: "Collide2", p_category: "women", oil_id: "OIL1", size_list: [{ size: "6", price: 1 }] });
  await assert.rejects(
    () => migrateCatalog(db, { apply: true, backupDir: dir, now }),
    (err) => err.code === "EEXIST"
  );
  assert.equal(
    (await db.collection("products").findOne({ p_name: "Collide2" })).p_category,
    "women",
    "the throw happened before the update loop ran"
  );
});
