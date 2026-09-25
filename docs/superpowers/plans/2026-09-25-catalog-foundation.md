# Catalogue Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the catalogue what the storefront needs: our own image uploads (stored in MongoDB), a clean category and size vocabulary, scent families/notes/description/keywords, normalised phones, a safe migration, and a real-browser test harness.

**Architecture:** Shared pure ES modules in `storefront/js/shared/` (vocab, phone) are imported by the server by path and by browsers from `/assets/js/shared/`. Images are `Image` documents served at `/img/<id>.<ext>`. Admin pages gain a shared `product-fields.js` (classic script) that loads the shared modules with `import()`. A migration script normalises existing data (dry run by default). A Playwright + installed-Edge harness drives the admin in a real browser.

**Tech Stack:** Node 24 ESM, Express 5, Mongoose 8.10, local MongoDB 8.3 replica set `rs0`, `node:test`, plain HTML/JS admin (Arabic RTL), `playwright-core` (dev) driving Microsoft Edge.

**Spec:** `docs/superpowers/specs/2026-09-25-catalog-foundation-design.md`

## Global Constraints

- **Local MongoDB only.** Tests use `tests/helpers.js` `startTestApp()` (per-pid `nsamat_test_<pid>` on `127.0.0.1:27017`, `rs0`). Never Atlas. Never print `.env`. **Never write to `nsamat_dev`** (the shop's data copy) — only Task 6 (controller) runs the migration there.
- New dependencies: only `playwright-core` (devDependency, Task 5). No multipart/image libraries.
- No `Co-Authored-By` trailer. Stage only your task's files; never `.claude/`, `Claude.md`, `backups/`.
- Quote every shell pattern and URL. `git status --short` before each commit.
- User-facing messages Arabic; API error shape `{ success: false, message }` via the central handler (throw `Object.assign(new Error(msg), { status, expose: true })`).
- Files < 500 lines. Admin pages build data-bearing DOM with `createElement`/`textContent` (never `innerHTML` with data).
- If a permission gate blocks an action, stop and report BLOCKED with the exact text — never work around it.

## File Map

| File | Responsibility |
|---|---|
| `storefront/js/shared/vocab.js` (new) | categories + scent families |
| `storefront/js/shared/phone.js` (new) | `normalizePhone`, `isJordanMobile` |
| `backend/models/product.model.js` (edit) | new fields, category enum, size setter/validator |
| `backend/controller/product.Controller.js` (edit) | persist new fields |
| `backend/controller/customer.Controller.js` (edit) | normalised phone lookup |
| `backend/models/image.model.js` (new) | uploaded images |
| `backend/controller/upload.Controller.js`, `backend/routes/upload.Routs.js` (new) | admin upload API |
| `backend/routes/image.Routs.js` (new) | public `/img/:file` |
| `backend/app.js` (edit) | mount `/assets`, `/api/uploads`, `/img` |
| `scripts/migrate-catalog.js` (new) | data migration (dry run / `--apply`) |
| `frontend/js/upload.js` (new, ES module) | browser resize + upload |
| `frontend/js/product-fields.js` (new, classic) | extra product form fields |
| `frontend/html/add_product.html`, `edit_product.html`, `all_products.html` (edit) | integrate |
| `frontend/html/catalog.html` (new) | bulk tagging |
| `frontend/js/navbar.js` (edit) | link to catalog.html |
| `tests/*.test.js` (new/edit), `tests/e2e/run.mjs` (new) | tests |
| `.gitignore` (edit) | `backups/` |

---

### Task 1: Shared vocabulary & phone modules, product model, controllers

**Files:** Create `storefront/js/shared/vocab.js`, `storefront/js/shared/phone.js`, `tests/catalog-model.test.js`. Modify `backend/models/product.model.js`, `backend/controller/product.Controller.js`, `backend/controller/customer.Controller.js`, `backend/app.js`, and every test fixture using a non-enum `p_category`.

**Interfaces — Produces:** `CATEGORIES`, `CATEGORY_KEYS`, `FAMILIES`, `FAMILY_KEYS` (vocab.js); `normalizePhone(input): string`, `isJordanMobile(p): boolean` (phone.js); `/assets/*` serves `storefront/`.

- [ ] **Step 1: `storefront/js/shared/vocab.js`**

```js
// Shared catalogue vocabulary: imported by the server (by path) and by browsers
// (/assets/js/shared/vocab.js). Pure data — no Node or browser APIs.
export const CATEGORIES = [
  { key: "Men", slug: "men", ar: "رجالي" },
  { key: "Women", slug: "women", ar: "نسائي" },
  { key: "Unisex", slug: "unisex", ar: "للجنسين" },
  { key: "Home", slug: "home", ar: "معطرات منزلية" },
  { key: "Car", slug: "car", ar: "معطرات سيارات" },
];

export const FAMILIES = [
  { key: "oud", ar: "عود", swatch: "#5B3A1E" },
  { key: "musk", ar: "مسك", swatch: "#E8E0D5" },
  { key: "amber", ar: "عنبر", swatch: "#C77D2E" },
  { key: "vanilla", ar: "فانيلا", swatch: "#E9D6A8" },
  { key: "leather", ar: "جلد", swatch: "#6B4A3A" },
  { key: "woody", ar: "خشبي", swatch: "#7A5C3E" },
  { key: "floral", ar: "زهري", swatch: "#D98BA0" },
  { key: "citrus", ar: "حمضي", swatch: "#E8C23A" },
  { key: "aquatic", ar: "مائي", swatch: "#5BA4C9" },
  { key: "powdery", ar: "بودري", swatch: "#D8C8D8" },
  { key: "tobacco", ar: "تبغ", swatch: "#8A5A2B" },
  { key: "coffee", ar: "قهوة", swatch: "#4B2E1F" },
  { key: "incense", ar: "بخور", swatch: "#9A8C7A" },
  { key: "oriental", ar: "شرقي", swatch: "#A23B2A" },
  { key: "gourmand", ar: "حلو", swatch: "#C98B5E" },
  { key: "spicy", ar: "توابل", swatch: "#B5532E" },
  { key: "fruity", ar: "فواكه", swatch: "#E0664F" },
  { key: "aromatic", ar: "أروماتيك", swatch: "#6E8B5E" },
  { key: "fresh", ar: "منعش", swatch: "#8FC7B8" },
];

export const CATEGORY_KEYS = CATEGORIES.map((c) => c.key);
export const FAMILY_KEYS = FAMILIES.map((f) => f.key);
```

- [ ] **Step 2: `storefront/js/shared/phone.js`**

```js
// Jordan phone numbers as customers really type them (Arabic-Indic digits, +962, spaces).
// Pure — shared by the server, the checkout and the admin.
const ARABIC_DIGITS = /[٠-٩۰-۹]/g;

export function normalizePhone(input) {
  let digits = String(input ?? "")
    .replace(ARABIC_DIGITS, (d) => {
      const c = d.charCodeAt(0);
      return String(c <= 0x0669 ? c - 0x0660 : c - 0x06f0);
    })
    .replace(/\D/g, "");
  if (digits.startsWith("00962")) digits = "0" + digits.slice(5);
  else if (digits.startsWith("962")) digits = "0" + digits.slice(3);
  else if (digits.length === 9 && digits.startsWith("7")) digits = "0" + digits;
  return digits;
}

export const isJordanMobile = (p) => /^07[789]\d{7}$/.test(p);
```

- [ ] **Step 3: Failing tests** — `tests/catalog-model.test.js`

```js
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { startTestApp, loginAs } from "./helpers.js";
import Product from "../backend/models/product.model.js";
import Customer from "../backend/models/customer.model.js";
import { normalizePhone, isJordanMobile } from "../storefront/js/shared/phone.js";

let t, cookie;
before(async () => { t = await startTestApp(); cookie = await loginAs(t.url); await Product.init(); });
after(() => t.close());

const api = (path, method = "GET", body) => fetch(`${t.url}/api${path}`, {
  method, headers: { cookie, "Content-Type": "application/json" },
  body: body === undefined ? undefined : JSON.stringify(body),
});
const base = (extra = {}) => ({
  p_name: `P ${Math.random()}`, p_image: "x", p_category: "Men", oil_id: "OIL1",
  size_list: [{ size: "30", price: 20 }], oil_percentage: 20, alcohol_percentage: 80, ...extra,
});

test("normalizePhone handles Arabic digits and country codes", () => {
  for (const input of ["٠٧٩١٢٣٤٥٦٧", "+962 79 123 4567", "962791234567", "791234567", "00962791234567", "079-123-4567"]) {
    assert.equal(normalizePhone(input), "0791234567", input);
  }
  assert.equal(isJordanMobile("0791234567"), true);
  assert.equal(isJordanMobile("0761234567"), false);
  assert.equal(isJordanMobile(normalizePhone("12345")), false);
});

test("POST /api/products persists the new catalogue fields", async () => {
  const res = await api("/products", "POST", base({
    description: "عطر خشبي دافئ", families: ["oud", "amber"],
    notes: { top: ["برغموت"], heart: ["ورد"], base: ["عود", "عنبر"] },
    images: ["/img/64b7f0000000000000000001.webp"], keywords: "sauvage elixir",
  }));
  assert.equal(res.status, 201);
  const p = await Product.findById((await res.json()).data._id).lean();
  assert.deepEqual(p.families, ["oud", "amber"]);
  assert.deepEqual(p.notes.base, ["عود", "عنبر"]);
  assert.equal(p.description, "عطر خشبي دافئ");
  assert.deepEqual(p.images, ["/img/64b7f0000000000000000001.webp"]);
  assert.equal(p.keywords, "sauvage elixir");
});

test("invalid catalogue values are rejected with 400", async () => {
  for (const bad of [
    base({ p_category: "test" }),
    base({ families: ["not-a-family"] }),
    base({ notes: { top: ["x".repeat(41)] } }),
    base({ size_list: [{ size: "abc", price: 10 }] }),
    base({ images: ["javascript:alert(1)"] }),
  ]) {
    assert.equal((await api("/products", "POST", bad)).status, 400, JSON.stringify(bad));
  }
});

test("size '30ml' is stored as '30'", async () => {
  const res = await api("/products", "POST", base({ size_list: [{ size: "30ml", price: 10 }, { size: " 50 مل ", price: 15 }] }));
  const p = await Product.findById((await res.json()).data._id).lean();
  assert.deepEqual(p.size_list.map((s) => s.size), ["30", "50"]);
});

test("partial update (bulk tagging) changes only the sent fields", async () => {
  const created = await (await api("/products", "POST", base())).json();
  const res = await api(`/products/${created.data._id}`, "PUT", { p_category: "Women", families: ["floral"] });
  assert.equal(res.status, 200);
  const p = await Product.findById(created.data._id).lean();
  assert.equal(p.p_category, "Women");
  assert.deepEqual(p.families, ["floral"]);
  assert.equal(p.size_list[0].price, 20);
});

test("customer phone lookup normalises the input", async () => {
  await Customer.create({ name: "Sara", phone: "0791234567" });
  const res = await api(`/customers/phone/${encodeURIComponent("+962 79 123 4567")}`);
  assert.equal((await res.json()).customer.name, "Sara");
});

test("/assets serves the shared modules", async () => {
  const res = await fetch(`${t.url}/assets/js/shared/vocab.js`);
  assert.equal(res.status, 200);
  assert.match(res.headers.get("content-type"), /javascript/);
});
```

- [ ] **Step 4: Run, expect FAIL** — `node --test tests/catalog-model.test.js`.

- [ ] **Step 5: Model** — in `backend/models/product.model.js`:

```js
import mongoose from "mongoose";
import { CATEGORY_KEYS, FAMILY_KEYS } from "../../storefront/js/shared/vocab.js";

// "30ml", " 50 مل " → "30", "50" (so the storefront and stock rules see one spelling).
const normalizeSize = (v) => String(v ?? "").trim().replace(/\s*(ml|مل)\s*$/i, "").trim();
const note = { type: String, trim: true, maxlength: 40 };
const noteList = {
  type: [note],
  validate: { validator: (v) => v.length <= 10, message: "عشر نوتات كحد أقصى لكل طبقة" },
};
const IMAGE_URL = /^(\/img\/[a-f0-9]{24}(-480)?\.(webp|jpg|png)|https:\/\/\S+)$/;
```
Then change `p_category` to `{ type: String, required: true, enum: CATEGORY_KEYS }`; change `size_list[].size` to
`{ type: String, required: true, set: normalizeSize, validate: { validator: (v) => /^\d+(\.\d+)?$/.test(v) && Number(v) > 0, message: "الحجم يجب أن يكون رقمًا موجبًا" } }`;
and add after `status`:
```js
    description: { type: String, trim: true, maxlength: 2000 },
    families: [{ type: String, enum: FAMILY_KEYS }],
    notes: { top: noteList, heart: noteList, base: noteList },
    images: [{ type: String, validate: { validator: (v) => IMAGE_URL.test(v), message: "رابط صورة غير صالح" } }],
    keywords: { type: String, trim: true, maxlength: 300 },
```

- [ ] **Step 6: Controllers.**
  - `createProduct`: also destructure `description, families, notes, images, keywords` from `req.body` and pass them to `new Product({...})`.
  - `customer.Controller.js` `getCustomerByPhone`: `import { normalizePhone } from "../../storefront/js/shared/phone.js";` and query `{ phone: normalizePhone(req.params.phone) }`.

- [ ] **Step 7: Mount `/assets`** in `backend/app.js` (next to the `/admin` static mount):
```js
const storefrontDir = fileURLToPath(new URL("../storefront", import.meta.url));
// ...
  app.use("/assets", express.static(storefrontDir));
```

- [ ] **Step 8: Fix existing fixtures.** `grep -rn "p_category" tests` — every fixture using a value outside `Men|Women|Unisex|Home|Car` (e.g. `"c"`) must use `"Men"`. Sizes like `"30ml"` in fixtures are fine (the setter normalises them) but assertions comparing `product_size` to `"30ml"` must expect `"30"`.

- [ ] **Step 9: Run, expect PASS** — `node --test tests/catalog-model.test.js`, then full `npm test` (all previously passing tests must still pass).

- [ ] **Step 10: Commit** — `git add storefront backend tests && git commit -m "feat: catalogue vocabulary, phone normalisation, product families/notes/images"`

---

### Task 2: Image uploads stored in MongoDB

**Files:** Create `backend/models/image.model.js`, `backend/controller/upload.Controller.js`, `backend/routes/upload.Routs.js`, `backend/routes/image.Routs.js`, `tests/uploads.test.js`. Modify `backend/app.js`.

**Interfaces — Produces:** `POST /api/uploads?kind=product|banner` (raw image body) → 201 `{ success, data: { id, url, thumb } }`; `POST /api/uploads/:id/thumb` (raw) → 200 same shape; `GET /img/<id>.<ext>` and `/img/<id>-480.<ext>`. `sniffImage(buf)` exported from the controller.

- [ ] **Step 1: Failing tests** — `tests/uploads.test.js`

```js
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { startTestApp, loginAs } from "./helpers.js";

let t, cookie;
before(async () => { t = await startTestApp(); cookie = await loginAs(t.url); });
after(() => t.close());

const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01]);
const WEBP = Buffer.concat([Buffer.from("RIFF"), Buffer.from([0x1a, 0, 0, 0]), Buffer.from("WEBPVP8 "), Buffer.alloc(14)]);
const up = (body, type, path = "/api/uploads?kind=product", withCookie = true) => fetch(`${t.url}${path}`, {
  method: "POST", headers: { ...(withCookie ? { cookie } : {}), "Content-Type": type }, body,
});

test("upload requires the admin session", async () => {
  assert.equal((await up(PNG, "image/png", undefined, false)).status, 401);
});

test("PNG, JPEG and WebP are accepted by magic bytes and served back immutable", async () => {
  for (const [buf, type, ext] of [[PNG, "image/png", "png"], [JPEG, "image/jpeg", "jpg"], [WEBP, "image/webp", "webp"]]) {
    const res = await up(buf, type);
    assert.equal(res.status, 201, type);
    const { data } = await res.json();
    assert.match(data.url, new RegExp(`^/img/[a-f0-9]{24}\\.${ext}$`));
    assert.equal(data.thumb, data.url.replace(`.${ext}`, `-480.${ext}`));
    const img = await fetch(`${t.url}${data.url}`);
    assert.equal(img.status, 200);
    assert.equal(img.headers.get("content-type"), type);
    assert.match(img.headers.get("cache-control"), /immutable/);
    assert.deepEqual(Buffer.from(await img.arrayBuffer()), buf);
    const thumbFallback = await fetch(`${t.url}${data.thumb}`);
    assert.equal(thumbFallback.status, 200, "thumb falls back to full");
  }
});

test("the type comes from the bytes, not the header", async () => {
  const res = await up(PNG, "image/jpeg");
  assert.equal(res.status, 201);
  assert.match((await res.json()).data.url, /\.png$/);
});

test("non-images are rejected", async () => {
  assert.equal((await up(Buffer.from("<svg xmlns='http://www.w3.org/2000/svg'/>"), "image/png")).status, 400);
  assert.equal((await up(Buffer.from("<html>hi</html>"), "image/webp")).status, 400);
  assert.equal((await up(Buffer.from("x"), "text/plain")).status, 400, "unparsed type arrives as {} → 400");
});

test("files over 3 MB are rejected with 413", async () => {
  const big = Buffer.concat([PNG, Buffer.alloc(3 * 1024 * 1024 + 10)]);
  assert.equal((await up(big, "image/png")).status, 413);
});

test("thumb upload is stored and served", async () => {
  const { data } = await (await up(PNG, "image/png")).json();
  const res = await up(JPEG, "image/jpeg", `/api/uploads/${data.id}/thumb`);
  assert.equal(res.status, 200);
  const thumb = await fetch(`${t.url}${data.thumb}`);
  assert.equal(thumb.headers.get("content-type"), "image/jpeg");
  assert.deepEqual(Buffer.from(await thumb.arrayBuffer()), JPEG);
});

test("unknown or malformed image paths are 404", async () => {
  assert.equal((await fetch(`${t.url}/img/64b7f0000000000000000000.png`)).status, 404);
  assert.equal((await fetch(`${t.url}/img/../../etc/passwd`)).status, 404);
  assert.equal((await fetch(`${t.url}/img/abc.png`)).status, 404);
});
```

- [ ] **Step 2: Run, expect FAIL.**

- [ ] **Step 3: `backend/models/image.model.js`**

```js
import mongoose from "mongoose";

// Uploaded images live in MongoDB (backed up with the data; managed hosts wipe local disks).
const TYPES = ["image/webp", "image/jpeg", "image/png"];
const imageSchema = new mongoose.Schema(
  {
    type: { type: String, enum: TYPES, required: true },
    full: { type: Buffer, required: true },
    thumb: Buffer,
    thumb_type: { type: String, enum: TYPES },
    bytes: Number,
  },
  { timestamps: true }
);

export default mongoose.model("Image", imageSchema);
```

- [ ] **Step 4: `backend/controller/upload.Controller.js`**

```js
import Image from "../models/image.model.js";

export const EXT = { "image/webp": "webp", "image/jpeg": "jpg", "image/png": "png" };
const fail = (status, message) => Object.assign(new Error(message), { status, expose: true });
const PNG_SIG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

// The declared Content-Type is not trusted: the type comes from the file's magic bytes.
export function sniffImage(buf) {
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "image/jpeg";
  if (buf.length >= 8 && buf.subarray(0, 8).equals(PNG_SIG)) return "image/png";
  if (buf.length >= 12 && buf.toString("latin1", 0, 4) === "RIFF" && buf.toString("latin1", 8, 12) === "WEBP") return "image/webp";
  return null;
}

function readImage(req) {
  // A mismatched Content-Type skips express.raw, so the body is {} (app.js sets req.body ??= {}).
  if (!Buffer.isBuffer(req.body) || req.body.length === 0) throw fail(400, "أرسل ملف صورة (JPEG أو PNG أو WebP)");
  const type = sniffImage(req.body);
  if (!type) throw fail(400, "نوع الملف غير مدعوم — استخدم JPEG أو PNG أو WebP");
  return { type, buf: req.body };
}

const urls = (img) => ({
  id: img._id,
  url: `/img/${img._id}.${EXT[img.type]}`,
  thumb: `/img/${img._id}-480.${EXT[img.type]}`,
});

export const uploadImage = async (req, res) => {
  const { type, buf } = readImage(req);
  const img = await Image.create({ type, full: buf, bytes: buf.length });
  res.status(201).json({ success: true, data: urls(img) });
};

export const uploadThumb = async (req, res) => {
  const { type, buf } = readImage(req);
  const img = await Image.findById(req.params.id);
  if (!img) throw fail(404, "الصورة غير موجودة");
  img.thumb = buf;
  img.thumb_type = type;
  await img.save();
  res.json({ success: true, data: urls(img) });
};
```

- [ ] **Step 5: `backend/routes/upload.Routs.js`**

```js
import express from "express";
import { uploadImage, uploadThumb } from "../controller/upload.Controller.js";

const router = express.Router();
// Raw parser only here, and only after requireAdmin (mounted below the guard in app.js).
const raw = express.raw({ type: ["image/jpeg", "image/png", "image/webp"], limit: "3mb" });

router.post("/", raw, uploadImage);
router.post("/:id/thumb", raw, uploadThumb);

export default router;
```

- [ ] **Step 6: `backend/routes/image.Routs.js`**

```js
import express from "express";
import Image from "../models/image.model.js";
import { EXT } from "../controller/upload.Controller.js";

const router = express.Router();
const FILE = /^([a-f0-9]{24})(-480)?\.(webp|jpg|png)$/;

// Public: ids are never reused, so responses are cacheable forever.
router.get("/:file", async (req, res) => {
  const m = FILE.exec(req.params.file);
  if (!m) return res.status(404).end();
  const img = await Image.findById(m[1]);
  if (!img || EXT[img.type] !== m[3]) return res.status(404).end();
  const useThumb = Boolean(m[2] && img.thumb);
  res.set("Cache-Control", "public, max-age=31536000, immutable");
  res.type(useThumb ? img.thumb_type : img.type).send(useThumb ? img.thumb : img.full);
});

export default router;
```

- [ ] **Step 7: Mount** in `backend/app.js`: import both routers; `app.use("/api/uploads", uploadRouter);` next to the other admin routers (below `app.use("/api", requireAdmin)`); `app.use("/img", imageRouter);` next to the `/assets` static mount (public, outside `/api`).

- [ ] **Step 8: Run, expect PASS** — `node --test tests/uploads.test.js`, then `npm test`.

- [ ] **Step 9: Commit** — `git add backend tests && git commit -m "feat: image uploads stored in MongoDB, served at /img"`

---

### Task 3: Catalogue migration script

**Files:** Create `scripts/migrate-catalog.js`, `tests/migrate-catalog.test.js`. Modify `.gitignore` (add `backups/`).

**Interfaces — Produces:** `migrateCatalog(db, { apply, backupDir, now }) → Promise<{ changes: [...], review: [...], backups: [paths] }>` (exported), plus a CLI.

- [ ] **Step 1: Failing test** — `tests/migrate-catalog.test.js`

```js
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
```

- [ ] **Step 2: Run, expect FAIL.**

- [ ] **Step 3: `scripts/migrate-catalog.js`**

```js
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
import { normalizePhone, isJordanMobile } from "../storefront/js/shared/phone.js";

const CATEGORY_MAP = {
  men: "Men", women: "Women", unisex: "Unisex", home: "Home", car: "Car",
  "منزلي": "Home", "فواح": "Car", "سيارات": "Car", defusers: "Car",
};
const normalizeSize = (v) => String(v ?? "").trim().replace(/\s*(ml|مل)\s*$/i, "").trim();
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
```
Note: `size_list` compare-and-set uses exact array equality on the stored array (including sub-document `_id`s), which is what was read.

- [ ] **Step 4: `.gitignore`** — add a line `backups/`.

- [ ] **Step 5: Run, expect PASS** — `node --test tests/migrate-catalog.test.js`, then `npm test`. Also run the CLI dry run against the **test** DB only if you need to see output — never against `nsamat_dev`.

- [ ] **Step 6: Commit** — `git add scripts tests .gitignore && git commit -m "feat: catalogue migration script (dry run by default, EJSON backups)"`

---

### Task 4: Admin UI — uploader, product fields, bulk tagging

**Files:** Create `frontend/js/upload.js`, `frontend/js/product-fields.js`, `frontend/html/catalog.html`. Modify `frontend/html/add_product.html`, `edit_product.html`, `all_products.html`, `frontend/js/navbar.js`, `frontend/css/style.css` (only small additions: chip checkbox, drop zone, gallery list).

**Interfaces — Consumes:** `/assets/js/shared/vocab.js`, `POST /api/uploads…`, `PUT /api/products/:id` (partial). **Produces:** `window.productFields.ready → Promise<{ read(): extras, fill(product): void }>`.

- [ ] **Step 1: `frontend/js/upload.js`** (ES module)

```js
// Resize in the browser, then upload full + thumb. Never uses blob: URLs (the CSP img-src has no blob:).
async function encode(bitmap, maxEdge) {
  const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  canvas.getContext("2d").drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  const toBlob = (type) => new Promise((resolve) => canvas.toBlob(resolve, type, 0.85));
  let blob = await toBlob("image/webp");
  if (!blob || blob.type !== "image/webp") blob = await toBlob("image/jpeg"); // Safari has no WebP encoder
  return blob;
}

async function post(url, blob) {
  const res = await fetch(url, { method: "POST", headers: { "Content-Type": blob.type }, body: blob });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.message || "فشل رفع الصورة");
  return body.data;
}

export async function uploadImage(file, { kind = "product" } = {}) {
  const bitmap = await createImageBitmap(file);
  try {
    const full = await encode(bitmap, kind === "banner" ? 2400 : 1400);
    const thumb = await encode(bitmap, 480);
    const saved = await post(`/api/uploads?kind=${kind}`, full);
    await post(`/api/uploads/${saved.id}/thumb`, thumb);
    return saved; // { id, url, thumb }
  } finally {
    bitmap.close();
  }
}
```

- [ ] **Step 2: `frontend/js/product-fields.js`** (classic script; the product pages' inline scripts are classic). It renders into `<div id="productExtras"></div>` and owns: the image drop zone (writes the uploaded URL into the page's existing `#p_image` input and `#imagePreview`), the gallery (`images`), family chips, notes, description, keywords, and fills the page's `<select id="p_category">` options.

```js
// Extra catalogue fields shared by add_product.html and edit_product.html.
// Usage: const pf = await window.productFields.ready; pf.fill(product); const extras = pf.read();
window.productFields = {
  ready: Promise.all([import("/assets/js/shared/vocab.js"), import("/admin/js/upload.js")])
    .then(([vocab, upload]) => buildProductFields(vocab, upload)),
};

function buildProductFields({ CATEGORIES, FAMILIES }, { uploadImage }) {
  const el = (tag, props = {}, ...children) => {
    const node = Object.assign(document.createElement(tag), props);
    node.append(...children);
    return node;
  };
  const images = []; // extra gallery images (URLs)

  // Category <select> already exists in the page markup; fill its options.
  const categorySelect = document.getElementById("p_category");
  categorySelect.replaceChildren(el("option", { value: "", textContent: "— اختر الفئة —" }),
    ...CATEGORIES.map((c) => el("option", { value: c.key, textContent: c.ar })));

  const root = document.getElementById("productExtras");

  // Primary image upload (fills the page's existing #p_image URL input + #imagePreview).
  const status = el("p", { className: "upload-status", role: "status" });
  const fileInput = el("input", { type: "file", accept: "image/jpeg,image/png,image/webp", id: "p_image_file" });
  const drop = el("label", { className: "drop-zone", htmlFor: "p_image_file", textContent: "اسحب صورة المنتج هنا أو اضغط للاختيار" });
  const setPrimary = (url) => {
    document.getElementById("p_image").value = url;
    const preview = document.getElementById("imagePreview");
    preview.src = url;
    preview.style.display = "block";
  };
  async function handleFiles(files, onDone) {
    for (const file of files) {
      status.textContent = "جارٍ رفع الصورة…";
      try { onDone(await uploadImage(file)); status.textContent = "تم رفع الصورة ✓"; }
      catch (err) { status.textContent = err.message; }
    }
  }
  fileInput.addEventListener("change", () => handleFiles(fileInput.files, (saved) => setPrimary(saved.url)));
  drop.addEventListener("dragover", (e) => { e.preventDefault(); drop.classList.add("is-over"); });
  drop.addEventListener("dragleave", () => drop.classList.remove("is-over"));
  drop.addEventListener("drop", (e) => {
    e.preventDefault(); drop.classList.remove("is-over");
    handleFiles(e.dataTransfer.files, (saved) => setPrimary(saved.url));
  });

  // Gallery.
  const galleryList = el("ul", { className: "gallery-list" });
  const galleryInput = el("input", { type: "file", accept: "image/jpeg,image/png,image/webp", multiple: true, id: "gallery_file" });
  function renderGallery() {
    galleryList.replaceChildren(...images.map((url, i) => {
      const move = (d) => () => { const j = i + d; if (j < 0 || j >= images.length) return; [images[i], images[j]] = [images[j], images[i]]; renderGallery(); };
      return el("li", {},
        el("img", { src: url, alt: "", className: "row-thumb" }),
        el("button", { type: "button", className: "btn btn-ghost btn-sm", textContent: "↑", onclick: move(-1), ariaLabel: "تحريك للأعلى" }),
        el("button", { type: "button", className: "btn btn-ghost btn-sm", textContent: "↓", onclick: move(1), ariaLabel: "تحريك للأسفل" }),
        el("button", { type: "button", className: "btn btn-ghost btn-sm", textContent: "جعلها الرئيسية", onclick: () => setPrimary(url) }),
        el("button", { type: "button", className: "btn btn-ghost btn-sm", textContent: "حذف", onclick: () => { images.splice(i, 1); renderGallery(); } }));
    }));
  }
  galleryInput.addEventListener("change", () => handleFiles(galleryInput.files, (saved) => { images.push(saved.url); renderGallery(); }));

  // Families, notes, description, keywords.
  const familyBox = el("div", { className: "chip-group" }, ...FAMILIES.map((f) => el("label", { className: "chip-check" },
    el("input", { type: "checkbox", name: "families", value: f.key }),
    el("span", { className: "swatch", style: `background:${f.swatch}` }),
    f.ar)));
  const text = (id, label, props = {}) => el("div", { className: "field" }, el("label", { htmlFor: id, textContent: label }), el(props.rows ? "textarea" : "input", { id, ...props }));

  root.append(
    el("div", { className: "field" }, el("label", { textContent: "رفع صورة المنتج" }), drop, fileInput, status),
    el("div", { className: "field" }, el("label", { htmlFor: "gallery_file", textContent: "صور إضافية" }), galleryInput, galleryList),
    el("div", { className: "field" }, el("span", { className: "field-label", textContent: "العائلات العطرية" }), familyBox),
    text("notes_top", "النوتات العليا (افصل بفواصل)"),
    text("notes_heart", "نوتات القلب (افصل بفواصل)"),
    text("notes_base", "النوتات الأساسية (افصل بفواصل)"),
    text("description", "الوصف", { rows: 4, maxLength: 2000 }),
    text("keywords", "كلمات بحث إضافية (مثل الاسم بالإنجليزية)", { maxLength: 300 }),
  );

  const list = (id) => document.getElementById(id).value.split(/[,،]/).map((s) => s.trim()).filter(Boolean);
  return {
    read: () => ({
      families: [...root.querySelectorAll("input[name=families]:checked")].map((i) => i.value),
      notes: { top: list("notes_top"), heart: list("notes_heart"), base: list("notes_base") },
      description: document.getElementById("description").value.trim(),
      keywords: document.getElementById("keywords").value.trim(),
      images: [...images],
    }),
    fill: (p) => {
      categorySelect.value = p.p_category ?? "";
      for (const box of root.querySelectorAll("input[name=families]")) box.checked = (p.families ?? []).includes(box.value);
      document.getElementById("notes_top").value = (p.notes?.top ?? []).join("، ");
      document.getElementById("notes_heart").value = (p.notes?.heart ?? []).join("، ");
      document.getElementById("notes_base").value = (p.notes?.base ?? []).join("، ");
      document.getElementById("description").value = p.description ?? "";
      document.getElementById("keywords").value = p.keywords ?? "";
      images.splice(0, images.length, ...(p.images ?? []));
      renderGallery();
    },
  };
}
```

- [ ] **Step 3: Integrate `add_product.html` and `edit_product.html`.**
  - Replace `<input type="text" id="p_category" required>` with `<select id="p_category" required></select>`.
  - Add `<div id="productExtras"></div>` right after the image field's `.field` div.
  - Load `<script src="../js/product-fields.js"></script>` in `<head>` after `navbar.js`.
  - add_product submit: `const extras = (await window.productFields.ready).read();` then `const data = { ...existingFields, ...extras };`.
  - edit_product: in `fetchProduct`, after the fetch, `const pf = await window.productFields.ready; pf.fill(product);` (keep the existing field assignments; `pf.fill` sets the category because the options must exist first); submit merges `pf.read()` like add.
  - Size placeholder text becomes `الحجم بالمل (مثال: 30)`.

- [ ] **Step 4: `all_products.html`** — in the row template, after the name cell content, append a badge when the product has no own photo:
  `${String(product.p_image).startsWith("/img/") ? "" : ' <span class="badge badge-pending">بدون صورة خاصة</span>'}`.

- [ ] **Step 5: `frontend/html/catalog.html`** (new; same head/navbar pattern as other admin pages). Page "تصنيف المنتجات": a table-card with a toggle "غير المصنّفة فقط" (no families). Script (classic, loads vocab with `import()`):
  - `GET /api/products` → for each product build a row with DOM APIs: thumbnail (`p_image`, `alt=""`), name (`textContent`), category `<select>` (CATEGORIES), family chip checkboxes (FAMILIES, checked from `families`), a "حفظ" button → `PUT /api/products/:id` with `{ p_category, families }` → on success show "تم الحفظ ✓" in the row (on error show the server message in the row).
  - Toggle filters rows client-side.
  - Never `innerHTML` with product data.

- [ ] **Step 6: navbar** — add `{ href: "catalog.html", label: "تصنيف المنتجات" }` to `NAV_LINKS` in `frontend/js/navbar.js`.

- [ ] **Step 7: CSS** — append to `frontend/css/style.css` (reuse existing tokens/classes; keep it small): `.drop-zone` (dashed border, padding, cursor pointer, `.is-over` highlight), `.chip-group` (flex wrap gap), `.chip-check` (inline-flex, border, radius 999px, padding, checkbox visually inside), `.swatch` (12px circle), `.gallery-list` (list with thumbnails and buttons), `.upload-status`.

- [ ] **Step 8: Verify** — `node --check frontend/js/product-fields.js`; `npm test` (backend unchanged, must pass). Browser verification happens in Task 5.

- [ ] **Step 9: Commit** — `git add frontend && git commit -m "feat: admin image upload, scent families/notes fields, bulk tagging page"`

---

### Task 5: Real-browser test harness (Playwright + installed Edge)

**Files:** Create `tests/e2e/run.mjs`. Modify `package.json` (devDependency `playwright-core`, script `test:e2e`).

**Interfaces — Consumes:** everything above. **Produces:** `npm run test:e2e` — starts the app on its own local test DB, seeds, drives Edge headless, exits non-zero on any failure. Later sub-projects add scenarios to this file (keep a `scenario(name, fn)` list).

- [ ] **Step 1:** `npm install --save-dev playwright-core@1` and add `"test:e2e": "node tests/e2e/run.mjs"` to `package.json` scripts.

- [ ] **Step 2: `tests/e2e/run.mjs`** — structure (write it fully; ~150 lines):
  - `process.env.SESSION_SECRET ||= "e2e-secret-".padEnd(48, "x")`; connect mongoose to `mongodb://127.0.0.1:27017/nsamat_e2e_${process.pid}?replicaSet=rs0`, `dropDatabase()`; seed an admin user (`hashPassword("e2e-pass-123")`), an oil `{ id: "OIL1", oil_name: "زيت تجريبي", oil_cost: 0.5, oil_quantity: 100 }`, a bottle 30 ml, alcohol, and one product; `createApp().listen(0)`.
  - `chromium.launch({ channel: "msedge", headless: true })`; a helper `openPage()` that records `console` messages of type `error`, `pageerror` events, and CSP violations (`page.on("console")` messages containing "Content Security Policy"), and a `check(page)` that fails the scenario if any were recorded.
  - Scenarios (each logs PASS/FAIL with the error; the process exits 1 if any fail):
    1. **Admin login** → `/admin/html/login.html`, fill `#username`/`#password`, submit, land on `index.html`.
    2. **Add product with an uploaded photo**: open `add_product.html`, wait for `window.productFields.ready`; write a small PNG to a temp file (use `canvas`-free bytes: the 1×1 PNG base64 from `tests/uploads.test.js`) and `setInputFiles("#p_image_file", tmpPath)`; wait until `#p_image` value matches `^/img/`; fill name, choose category `Women`, set oil via `page.evaluate` (`document.getElementById("oil_id").value = "OIL1"`), percentages, one size row (`30`, price `25`), tick families `oud` and `amber`, notes base `عود`; submit; then fetch `/api/products` in the page context and assert the new product has `p_category: "Women"`, `families: ["oud","amber"]`, `p_image` under `/img/`, and `GET` of that image URL is 200.
    3. **Edit product** keeps and changes fields: open `edit_product.html?id=<id>`, assert the family checkboxes are checked and the category is selected, untick `amber`, save, assert via API.
    4. **Bulk tagging**: open `catalog.html`, find the seeded product's row, choose `Unisex`, tick `musk`, click حفظ, see "تم الحفظ", assert via API.
    5. **No console/CSP errors** on `all_products.html`, `add_product.html`, `edit_product.html`, `catalog.html` (the `check(page)` after each).
  - Always: close the browser, drop the e2e DB, close the server — also on failure (`try/finally`).

- [ ] **Step 3: Run** — `npm run test:e2e` → all scenarios PASS; paste the real output. `npm test` still passes.

- [ ] **Step 4: Commit** — `git add package.json package-lock.json tests/e2e && git commit -m "test: real-browser e2e harness (Playwright + installed Edge)"`

---

### Task 6: Migrate the local dev data (controller)

- [ ] Dry run on `nsamat_dev`: `node scripts/migrate-catalog.js` → review the report.
- [ ] `--apply` (writes `backups/…json` first) → re-run the dry run → 0 changes.
- [ ] `npm test` and `npm run test:e2e` pass; smoke: `GET /api/products` in the admin shows the migrated categories.
