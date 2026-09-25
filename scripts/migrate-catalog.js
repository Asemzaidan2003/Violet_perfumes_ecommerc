// Catalogue migration — normalises categories, sizes and customer phones.
//   node scripts/migrate-catalog.js            (dry run: prints the target and the report)
//   node scripts/migrate-catalog.js --apply    (writes EJSON backups to backups/, then updates)
// Deploy order: stop the app → run with --apply → start the new code
// (the new category enum rejects edits of un-migrated products).
import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import mongoose from "mongoose";
import { normalizeSize } from "../storefront/js/shared/vocab.js";
import { normalizePhone, isJordanMobile } from "../storefront/js/shared/phone.js";

const CATEGORY_MAP = {
  men: "Men", women: "Women", unisex: "Unisex", home: "Home", car: "Car",
  "منزلي": "Home", "فواح": "Car", "سيارات": "Car", defusers: "Car",
};
const stamp = (d) => d.toISOString().replace(/[-:]/g, "").replace("T", "-").slice(0, 15);

export async function migrateCatalog(db, { apply = false, backupDir = "backups", now = new Date() } = {}) {
  const products = await db.collection("products").find().toArray();
  const customers = await db.collection("customers").find().toArray();
  const oilIds = new Set((await db.collection("oils").find({}, { projection: { id: 1 } }).toArray()).map((o) => o.id));
  const changes = [];
  const review = [];
  const updates = [];

  for (const p of products) {
    const set = {};
    const isTest = String(p.p_name).trim().toLowerCase() === "test";
    const raw = String(p.p_category ?? "").trim().toLowerCase();
    const category = isTest ? "Unisex" : CATEGORY_MAP[raw] ?? "Unisex";
    if (!isTest && !CATEGORY_MAP[raw]) review.push(`category needs review: ${p._id} ${p.p_name} "${p.p_category}" → Unisex`);
    if (category !== p.p_category) set.p_category = category;
    if (isTest && p.status !== "discontinued") set.status = "discontinued";

    const seen = new Set();
    const sizes = [];
    for (const s of p.size_list ?? []) {
      const size = normalizeSize(s.size);
      if (seen.has(size)) { review.push(`duplicate size dropped: ${p._id} ${p.p_name} "${s.size}"`); continue; }
      seen.add(size);
      sizes.push({ ...s, size });
      if (!/^\d+(\.\d+)?$/.test(size)) review.push(`non-numeric size: ${p._id} ${p.p_name} "${s.size}"`);
    }
    if (JSON.stringify(sizes) !== JSON.stringify(p.size_list ?? [])) set.size_list = sizes;
    if (!oilIds.has(p.oil_id)) review.push(`oil not found: ${p._id} ${p.p_name} oil_id "${p.oil_id}"`);

    for (const [field, value] of Object.entries(set)) {
      changes.push({ collection: "products", _id: p._id, name: p.p_name, field, from: p[field], to: value });
    }
    // Compare-and-set: only update if the document still has the values we read.
    if (Object.keys(set).length) {
      updates.push(["products", { _id: p._id, p_category: p.p_category, size_list: p.size_list, status: p.status }, { $set: set }]);
    }
  }

  for (const c of customers) {
    const phone = normalizePhone(c.phone);
    if (!isJordanMobile(phone)) { review.push(`phone not a Jordan mobile (left as is): ${c._id} ${c.name} "${c.phone}"`); continue; }
    if (phone !== c.phone) {
      changes.push({ collection: "customers", _id: c._id, name: c.name, field: "phone", from: c.phone, to: phone });
      updates.push(["customers", { _id: c._id, phone: c.phone }, { $set: { phone } }]);
    }
  }

  const backups = [];
  if (apply && updates.length) {
    fs.mkdirSync(backupDir, { recursive: true });
    for (const [name, docs] of [["products", products], ["customers", customers]]) {
      const file = path.join(backupDir, `${name}-${stamp(now)}.json`);
      fs.writeFileSync(file, mongoose.mongo.BSON.EJSON.stringify(docs, { relaxed: false }));
      backups.push(file);
    }
    for (const [collection, filter, update] of updates) {
      const r = await db.collection(collection).updateOne(filter, update);
      if (r.matchedCount === 0) review.push(`skipped (changed since read): ${collection} ${filter._id}`);
    }
  }
  return { changes, review, backups };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const apply = process.argv.includes("--apply");
  await mongoose.connect(process.env.MONGO_URI);
  const { host, name } = mongoose.connection;
  console.log(`${apply ? "APPLY" : "DRY RUN"} on ${host}/${name}`);
  const { changes, review, backups } = await migrateCatalog(mongoose.connection.db, { apply });
  for (const c of changes) console.log(`${c.collection} ${c._id} ${c.name}: ${c.field} ${JSON.stringify(c.from)} → ${JSON.stringify(c.to)}`);
  for (const r of review) console.log(`REVIEW ${r}`);
  console.log(`${changes.length} change(s), ${review.length} item(s) to review${apply ? `, backups: ${backups.join(", ") || "none"}` : " — run with --apply to write"}`);
  await mongoose.disconnect();
}
