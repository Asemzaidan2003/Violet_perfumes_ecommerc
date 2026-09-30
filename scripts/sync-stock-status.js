// Brings stored oil/product statuses in line with stock (oil qty <= 0 -> "out of stock", restocked -> "available").
//   node scripts/sync-stock-status.js            (dry run: prints the target host and what WOULD change)
//   node scripts/sync-stock-status.js --apply    (writes the status changes)
// "discontinued" is never touched. The running app does the same automatically after every stock change and at startup.
import "dotenv/config";
import mongoose from "mongoose";
import { syncStockStatus } from "../backend/services/stockStatus.js";

const apply = process.argv.includes("--apply");
await mongoose.connect(process.env.MONGO_URI);
console.log(`Target: ${mongoose.connection.host}/${mongoose.connection.name}  (${apply ? "APPLY" : "dry run"})`);
const r = await syncStockStatus({ dryRun: !apply });
console.log(`${apply ? "Changed" : "Would change"}: oils -> out of stock ${r.oilsOut}, oils -> available ${r.oilsBack}, products -> out of stock ${r.productsOut}, products -> available ${r.productsBack}`);
await mongoose.disconnect();
