# Production Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Lock down the Nsamat backend (admin auth, safe errors, security headers, same-origin frontend) so a public storefront can later share it.

**Architecture:** `backend/app.js` builds the Express 5 app (exported for tests); `backend/server.js` connects Mongo, seeds the first admin, listens. Auth is a stdlib-only signed cookie. All `/api/*` except `/api/auth/*` and `/api/health` require an admin. Express serves `frontend/` at `/admin`.

**Tech Stack:** Node 24 (ESM), Express 5, Mongoose 8, helmet, `node:test` + global `fetch`, local MongoDB 8.3 replica set `rs0`.

**Spec:** `docs/superpowers/specs/2026-09-25-production-hardening-design.md`

## Global Constraints

- **Local MongoDB only.** Dev: `mongodb://127.0.0.1:27017/nsamat_dev?replicaSet=rs0`. Tests: `mongodb://127.0.0.1:27017/nsamat_test_<pid>?replicaSet=rs0`. Never Atlas / `mongodb+srv://`. Never read or print `.env` secrets.
- Only new runtime dependency: `helmet`. Remove `pkj`, `mongodb`. Upgrade `express` to `^5`. No bcrypt, JWT, cookie-parser, supertest, validation libs.
- Tests live in `tests/`, named `*.test.js`, run with `npm test` (`node --test "tests/**/*.test.js"`). Each test file runs in its own process with its own DB.
- Keep files under 500 lines. Match existing style (ESM, `*.Controller.js`, `*.Routs.js`, `*.model.js`, JSON `{ success, message, data }`).
- Error JSON shape: `{ success: false, message: string }`.
- No `Co-Authored-By` trailer in commit messages (project CLAUDE.md rule). Do not commit `.env`.

## File Map

| File | Responsibility |
|---|---|
| `backend/app.js` (new) | `createApp()` — middleware, routers, static, errors |
| `backend/server.js` (rewrite) | env check, connect, seed, listen, graceful shutdown |
| `backend/config/db.js` (delete) | replaced by inline connect in server.js |
| `backend/middleware/error.js` (new) | `errorHandler` |
| `backend/middleware/auth.js` (new) | password hash, token sign/verify, `requireAdmin` |
| `backend/models/user.model.js` (new) | admin users |
| `backend/controller/auth.Controller.js` (new) | login/logout/me, rate limit, `seedAdmin` |
| `backend/routes/auth.Routs.js` (new) | auth routes |
| `backend/controller/*.Controller.js` (edit) | delete try/catch |
| `backend/models/*.model.js` (edit) | `min`, `trim` |
| `backend/*/cart.*` (delete) | dead code (broken import, never mounted) |
| `frontend/html/login.html` (new) | login page |
| `frontend/js/navbar.js` (edit) | auth guard + logout |
| `frontend/**` (edit) | `http://localhost:5000/api` → `/api` |
| `tests/helpers.js` (new) | start app on local test DB, login helper |

---

### Task 1: App/server split, error handler, health, static, helmet

**Files:**
- Create: `backend/app.js`, `backend/middleware/error.js`, `tests/helpers.js`, `tests/app.test.js`, `.env.example`
- Rewrite: `backend/server.js`
- Delete: `backend/config/db.js`, `backend/routes/cart.Routs.js`, `backend/controller/cart.Controller.js`, `backend/models/cart.model.js`
- Modify: `package.json`

**Interfaces:**
- Produces: `createApp(): express.Application` from `backend/app.js`; `startTestApp(): Promise<{ url: string, close(): Promise<void> }>` from `tests/helpers.js`. Task 2 inserts `authRouter` + `requireAdmin` at the marked line in `app.js`.

- [ ] **Step 1: Dependencies and scripts**

```bash
npm uninstall pkj mongodb
npm install express@^5 helmet
```
In `package.json` set `"main": "backend/server.js"` and:
```json
"scripts": {
  "start": "node backend/server.js",
  "dev": "nodemon backend/server.js",
  "test": "node --test \"tests/**/*.test.js\""
}
```

- [ ] **Step 2: Test helper** — `tests/helpers.js`

```js
import { once } from "node:events";
import mongoose from "mongoose";
import { createApp } from "../backend/app.js";

process.env.SESSION_SECRET ||= "test-session-secret-".padEnd(48, "x");

export async function startTestApp() {
  const uri = `mongodb://127.0.0.1:27017/nsamat_test_${process.pid}?replicaSet=rs0`;
  await mongoose.connect(uri);
  await mongoose.connection.dropDatabase();
  const server = createApp().listen(0, "127.0.0.1");
  await once(server, "listening");
  return {
    url: `http://127.0.0.1:${server.address().port}`,
    async close() {
      await mongoose.connection.dropDatabase();
      await mongoose.disconnect();
      await new Promise((r) => server.close(r));
    },
  };
}
```

- [ ] **Step 3: Failing tests** — `tests/app.test.js`

```js
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { startTestApp } from "./helpers.js";

let t;
before(async () => { t = await startTestApp(); });
after(() => t.close());

test("health reports db connected", async () => {
  const res = await fetch(`${t.url}/api/health`);
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { ok: true, db: true });
});

test("unknown api route is JSON 404", async () => {
  const res = await fetch(`${t.url}/api/nope`);
  assert.equal(res.status, 404);
  assert.equal((await res.json()).success, false);
});

test("malformed JSON is 400 without internals", async () => {
  const res = await fetch(`${t.url}/api/health`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: "{bad",
  });
  assert.equal(res.status, 400);
  assert.deepEqual(await res.json(), { success: false, message: "Invalid JSON" });
});

test("admin UI served at /admin with security headers", async () => {
  const res = await fetch(`${t.url}/admin/html/index.html`);
  assert.equal(res.status, 200);
  assert.ok(res.headers.get("content-security-policy"));
  assert.equal(res.headers.get("x-powered-by"), null);
});
```
Note: the "unknown route" test will change to 401 once Task 2 guards `/api` — Task 2 updates it.

- [ ] **Step 4: Run, expect FAIL** — `npm test` → fails: `Cannot find module '../backend/app.js'`.

- [ ] **Step 5: `backend/middleware/error.js`**

```js
// Single place that turns thrown errors into safe JSON. Never leaks err.message
// for unexpected errors — those are logged server-side only.
export function errorHandler(err, req, res, next) {
  const send = (status, message) => res.status(status).json({ success: false, message });
  if (err.type === "entity.parse.failed") return send(400, "Invalid JSON");
  if (err.type === "entity.too.large") return send(413, "Request too large");
  if (err.name === "CastError") return send(400, "Invalid id");
  if (err.name === "ValidationError") {
    return send(400, Object.values(err.errors).map((e) => e.message).join(", "));
  }
  if (err.code === 11000) return send(409, "Duplicate value");
  console.error(err);
  send(500, "Server error");
}
```

- [ ] **Step 6: `backend/app.js`**

```js
import express from "express";
import helmet from "helmet";
import cors from "cors";
import mongoose from "mongoose";
import { fileURLToPath } from "node:url";
import productRouter from "./routes/product.Routs.js";
import oilRouter from "./routes/oil.Routs.js";
import bottleRouter from "./routes/bottle.Routs.js";
import alcoholRouter from "./routes/alcohol.Routs.js";
import orderRouter from "./routes/order.Routs.js";
import customerRouter from "./routes/customer.Routs.js";
import reportRouter from "./routes/report.Routs.js";
import { errorHandler } from "./middleware/error.js";

// Update queries (findByIdAndUpdate etc.) validate against the schema too.
mongoose.set("runValidators", true);

const frontendDir = fileURLToPath(new URL("../frontend", import.meta.url));

export function createApp() {
  const app = express();
  const prod = process.env.NODE_ENV === "production";

  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        // ponytail: admin pages use inline <script>/onclick; move to files to drop 'unsafe-inline'
        "script-src": ["'self'", "'unsafe-inline'"],
        "script-src-attr": ["'unsafe-inline'"],
        "img-src": ["'self'", "data:", "https:"],
        "upgrade-insecure-requests": prod ? [] : null,
      },
    },
  }));

  const origins = (process.env.ALLOWED_ORIGINS || "").split(",").map((s) => s.trim()).filter(Boolean);
  if (origins.length) app.use(cors({ origin: origins, credentials: true }));

  app.use(express.json({ limit: "100kb" }));

  app.get("/api/health", (req, res) => {
    res.json({ ok: true, db: mongoose.connection.readyState === 1 });
  });
  // AUTH: Task 2 mounts /api/auth and requireAdmin here.

  app.use("/api/products", productRouter);
  app.use("/api/oils", oilRouter);
  app.use("/api/bottles", bottleRouter);
  app.use("/api/alcohols", alcoholRouter);
  app.use("/api/orders", orderRouter);
  app.use("/api/customers", customerRouter);
  app.use("/api/reports", reportRouter);
  app.use("/api", (req, res) => res.status(404).json({ success: false, message: "Not found" }));

  app.use("/admin", express.static(frontendDir));
  app.get("/", (req, res) => res.redirect("/admin/html/index.html")); // storefront takes "/" later

  app.use(errorHandler);
  return app;
}
```
Verify `mongoose.set("runValidators", true)` is accepted by the installed Mongoose 8 (it throws on unknown options). If it throws, remove it and add `runValidators: true` to each `findByIdAndUpdate`/`findOneAndUpdate` options object in the controllers instead.

- [ ] **Step 7: `backend/server.js`** (full rewrite)

```js
import "dotenv/config";
import mongoose from "mongoose";
import { createApp } from "./app.js";

for (const key of ["MONGO_URI", "SESSION_SECRET"]) {
  if (!process.env[key]) { console.error(`Missing required env var ${key}`); process.exit(1); }
}
if (process.env.SESSION_SECRET.length < 32) {
  console.error("SESSION_SECRET must be at least 32 characters"); process.exit(1);
}

await mongoose.connect(process.env.MONGO_URI);
console.log(`MongoDB connected: ${mongoose.connection.host}`);
// SEED: Task 2 adds `await seedAdmin();` here.

const port = process.env.PORT || 3000;
const server = createApp().listen(port, () => console.log(`Server started on port ${port}`));

const shutdown = () => server.close(() => mongoose.disconnect().then(() => process.exit(0)));
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
```
Delete `backend/config/db.js` and the three cart files.

- [ ] **Step 8: `.env.example`**

```
# Local development only — MongoDB replica set rs0 on this machine.
MONGO_URI=mongodb://127.0.0.1:27017/nsamat_dev?replicaSet=rs0
PORT=5000
NODE_ENV=development
# 32+ random chars: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
SESSION_SECRET=
# Only used to create the first admin when the users collection is empty.
ADMIN_USERNAME=admin
ADMIN_PASSWORD=
# Comma-separated origins allowed to call the API cross-origin (empty = same-origin only).
ALLOWED_ORIGINS=
```

- [ ] **Step 9: Run, expect PASS** — `npm test` → 4 passing. Then `npm start` boots and prints `Server started on port 5000`; Ctrl+C exits cleanly.

- [ ] **Step 10: Commit**

```bash
git add package.json package-lock.json backend tests .env.example
git commit -m "refactor: split app/server, central error handler, helmet, serve admin UI"
```

---

### Task 2: Admin authentication

**Files:**
- Create: `backend/models/user.model.js`, `backend/middleware/auth.js`, `backend/controller/auth.Controller.js`, `backend/routes/auth.Routs.js`, `tests/auth.test.js`, `tests/login-rate-limit.test.js`
- Modify: `backend/app.js` (AUTH marker), `backend/server.js` (SEED marker), `tests/helpers.js` (add `loginAs`), `tests/app.test.js` (404 test)

**Interfaces:**
- Consumes: `createApp`, `startTestApp` (Task 1).
- Produces: `POST /api/auth/login {username,password}` → 200 `{success:true,data:{username,role}}` + `Set-Cookie: nsamat_session=...`; 401 bad creds; 429 after 5 failures/15 min/IP. `POST /api/auth/logout` → 200, clears cookie. `GET /api/auth/me` → 200 `{success:true,data:{username,role}}` or 401. Any other `/api/*` without a valid cookie → 401 `{success:false,message:"Unauthorized"}`. `loginAs(url): Promise<string>` (returns a `Cookie` header value) in `tests/helpers.js`.

- [ ] **Step 1: Failing tests** — `tests/auth.test.js`

```js
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
```

`tests/login-rate-limit.test.js` (own file → own process → fresh limiter):
```js
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { startTestApp, loginAs } from "./helpers.js";

let t;
before(async () => { t = await startTestApp(); await loginAs(t.url); });
after(() => t.close());

test("6th failed login within 15 min is 429", async () => {
  const bad = () => fetch(`${t.url}/api/auth/login`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: "admin", password: "wrong" }),
  });
  for (let i = 0; i < 5; i++) assert.equal((await bad()).status, 401);
  assert.equal((await bad()).status, 429);
});
```
Note: `loginAs` itself succeeds, and success resets the limiter, so it doesn't count.

In `tests/app.test.js` change the unknown-route test to expect `401` (the guard runs before the 404), and rename it `"unknown api route without session is 401"`.

Add to `tests/helpers.js`:
```js
import User from "../backend/models/user.model.js";
import { hashPassword } from "../backend/middleware/auth.js";

export async function loginAs(url, username = "admin", password = "test-pass") {
  if (!(await User.exists({ username }))) {
    await User.create({ username, password_hash: await hashPassword(password), role: "admin" });
  }
  const res = await fetch(`${url}/api/auth/login`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  });
  if (res.status !== 200) throw new Error(`login failed: ${res.status}`);
  return res.headers.get("set-cookie").split(";")[0];
}
```

- [ ] **Step 2: Run, expect FAIL** — `npm test` → `Cannot find module '../backend/middleware/auth.js'`.

- [ ] **Step 3: `backend/models/user.model.js`**

```js
import mongoose from "mongoose";

const userSchema = new mongoose.Schema(
  {
    username: { type: String, required: true, unique: true, trim: true },
    password_hash: { type: String, required: true },
    role: { type: String, enum: ["admin"], default: "admin" },
  },
  { timestamps: true }
);

export default mongoose.model("User", userSchema);
```

- [ ] **Step 4: `backend/middleware/auth.js`**

```js
import crypto from "node:crypto";
import { promisify } from "node:util";
import User from "../models/user.model.js";

const scrypt = promisify(crypto.scrypt);
export const COOKIE = "nsamat_session";
const TTL_MS = 12 * 60 * 60 * 1000;

export async function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString("hex");
  const key = await scrypt(password, salt, 64);
  return `${salt}:${key.toString("hex")}`;
}

export async function verifyPassword(password, stored) {
  const [salt, hex] = String(stored).split(":");
  if (!salt || !hex) return false;
  const key = await scrypt(password, salt, 64);
  const expected = Buffer.from(hex, "hex");
  return expected.length === key.length && crypto.timingSafeEqual(key, expected);
}

const sign = (data) =>
  crypto.createHmac("sha256", process.env.SESSION_SECRET).update(data).digest("base64url");

// Token = "<userId>.<expiryMs>.<hmac>" — stateless, no JWT library needed.
export function createToken(userId, now = Date.now()) {
  const data = `${userId}.${now + TTL_MS}`;
  return `${data}.${sign(data)}`;
}

export function verifyToken(token, now = Date.now()) {
  const [id, exp, mac] = String(token ?? "").split(".");
  if (!id || !exp || !mac) return null;
  const good = Buffer.from(sign(`${id}.${exp}`));
  const got = Buffer.from(mac);
  if (good.length !== got.length || !crypto.timingSafeEqual(good, got)) return null;
  return Number(exp) > now ? id : null;
}

export const cookieOptions = () => ({
  httpOnly: true,
  sameSite: "strict",
  secure: process.env.NODE_ENV === "production",
  maxAge: TTL_MS,
  path: "/",
});

function readCookie(req, name) {
  const pair = (req.headers.cookie || "").split(";").map((s) => s.trim())
    .find((s) => s.startsWith(`${name}=`));
  return pair ? decodeURIComponent(pair.slice(name.length + 1)) : null;
}

export async function requireAdmin(req, res, next) {
  const id = verifyToken(readCookie(req, COOKIE));
  // DB lookup per request so deleting a user revokes their session immediately.
  const user = id && (await User.findById(id).select("username role").lean());
  if (!user || user.role !== "admin") {
    return res.status(401).json({ success: false, message: "Unauthorized" });
  }
  req.user = user;
  next();
}
```

- [ ] **Step 5: `backend/controller/auth.Controller.js`**

```js
import User from "../models/user.model.js";
import { COOKIE, cookieOptions, createToken, hashPassword, verifyPassword } from "../middleware/auth.js";

// ponytail: in-memory per-IP limiter, single process only; move to Mongo/Redis if scaled out.
const failures = new Map();
const WINDOW_MS = 15 * 60 * 1000;
const MAX_FAILURES = 5;

export const login = async (req, res) => {
  const now = Date.now();
  const f = failures.get(req.ip);
  const active = f && now - f.first < WINDOW_MS ? f : null;
  if (active && active.count >= MAX_FAILURES) {
    return res.status(429).json({ success: false, message: "Too many attempts, try again later" });
  }

  const { username, password } = req.body ?? {};
  if (typeof username !== "string" || typeof password !== "string") {
    return res.status(400).json({ success: false, message: "Username and password are required" });
  }

  const user = await User.findOne({ username });
  if (!user || !(await verifyPassword(password, user.password_hash))) {
    const entry = active ?? { count: 0, first: now };
    entry.count++;
    failures.set(req.ip, entry);
    return res.status(401).json({ success: false, message: "Invalid username or password" });
  }

  failures.delete(req.ip);
  res.cookie(COOKIE, createToken(user._id.toString()), cookieOptions());
  res.json({ success: true, data: { username: user.username, role: user.role } });
};

export const logout = (req, res) => {
  const { maxAge, ...opts } = cookieOptions();
  res.clearCookie(COOKIE, opts);
  res.json({ success: true });
};

export const me = (req, res) => {
  res.json({ success: true, data: { username: req.user.username, role: req.user.role } });
};

export async function seedAdmin({ ADMIN_USERNAME, ADMIN_PASSWORD } = process.env) {
  if (await User.exists({})) return;
  if (!ADMIN_USERNAME || !ADMIN_PASSWORD) {
    throw new Error("No users exist: set ADMIN_USERNAME and ADMIN_PASSWORD to create the first admin");
  }
  await User.create({ username: ADMIN_USERNAME, password_hash: await hashPassword(ADMIN_PASSWORD) });
  console.log(`Seeded admin user "${ADMIN_USERNAME}"`);
}
```

- [ ] **Step 6: `backend/routes/auth.Routs.js`**

```js
import express from "express";
import { login, logout, me } from "../controller/auth.Controller.js";
import { requireAdmin } from "../middleware/auth.js";

const router = express.Router();

router.post("/login", login);
router.post("/logout", logout);
router.get("/me", requireAdmin, me);

export default router;
```

- [ ] **Step 7: Wire it up.** In `backend/app.js` add imports
`import authRouter from "./routes/auth.Routs.js";` and `import { requireAdmin } from "./middleware/auth.js";`, and replace the `// AUTH:` comment line with:
```js
  app.use("/api/auth", authRouter);
  app.use("/api", requireAdmin); // everything below is admin-only; storefront adds public routes above this line
```
In `backend/server.js` add `import { seedAdmin } from "./controller/auth.Controller.js";` and replace the `// SEED:` comment line with `await seedAdmin();`.

- [ ] **Step 8: Run, expect PASS** — `npm test` → all passing.

- [ ] **Step 9: Commit**

```bash
git add backend tests
git commit -m "feat: admin authentication guarding all API routes"
```

---

### Task 3: Controller cleanup & schema validation

**Files:**
- Modify: `backend/controller/{alcohol,bottle,customer,oil,order,product,report}.Controller.js`, `backend/models/{alcohol,bottle,customer,oil,product}.model.js`
- Test: `tests/errors.test.js`

**Interfaces:**
- Consumes: `startTestApp`, `loginAs` (Tasks 1–2). Route paths and success response bodies MUST stay byte-for-byte the same — the admin frontend depends on them.

- [ ] **Step 1: Failing tests** — `tests/errors.test.js`

```js
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { startTestApp, loginAs } from "./helpers.js";

import Product from "../backend/models/product.model.js";

let t, cookie;
before(async () => {
  t = await startTestApp();
  cookie = await loginAs(t.url);
  await Product.init(); // build the unique p_name index before the duplicate test
});
after(() => t.close());

const api = (path, init = {}) => fetch(`${t.url}/api${path}`, {
  ...init, headers: { cookie, "Content-Type": "application/json", ...init.headers },
});

test("bad ObjectId is 400 Invalid id", async () => {
  for (const path of ["/products/xyz", "/orders/xyz", "/customers/xyz", "/bottles/xyz"]) {
    const res = await api(path);
    assert.equal(res.status, 400, path);
    assert.deepEqual(await res.json(), { success: false, message: "Invalid id" });
  }
});

test("missing record is 404", async () => {
  const res = await api("/products/64b7f0000000000000000000");
  assert.equal(res.status, 404);
});

test("negative stock is rejected with 400 on create and update", async () => {
  const create = await api("/bottles", {
    method: "POST", body: JSON.stringify({ name: "B", capacity: 30, cost: 1, quantity: -1 }),
  });
  assert.equal(create.status, 400);
  const ok = await api("/bottles", {
    method: "POST", body: JSON.stringify({ name: "B", capacity: 30, cost: 1, quantity: 5 }),
  });
  const id = (await ok.json()).data._id;
  const upd = await api(`/bottles/${id}`, { method: "PUT", body: JSON.stringify({ quantity: -3 }) });
  assert.equal(upd.status, 400);
});

test("500s never leak error details", async () => {
  // duplicate product name → 409 via central handler, not a raw Mongo error
  const body = JSON.stringify({ p_name: "Dup", p_image: "x", p_category: "c", oil_id: "o1",
    size_list: [{ size: "30ml", price: 10 }], oil_percentage: 20, alcohol_percentage: 80 });
  await api("/products", { method: "POST", body });
  const res = await api("/products", { method: "POST", body });
  assert.equal(res.status, 409);
  assert.deepEqual(Object.keys(await res.json()).sort(), ["message", "success"]);
});
```
Before writing Step 1, open `bottle.Controller.js` and `product.Controller.js` and confirm the create response shape is `{ ..., data: <doc> }`; adjust `(await ok.json()).data._id` if the controller returns the doc differently.

- [ ] **Step 2: Run, expect FAIL** — `npm test` → bad-id tests get 500/404 instead of 400; duplicate gets 500.

- [ ] **Step 3: Remove try/catch in every controller.** Mechanical rule for each exported handler in the 7 controllers:
  - Delete the `try {` line and the entire `catch (...) { ... }` block; un-indent the body.
  - Keep every existing `return res.status(4xx)...` validation/404 branch and every success response exactly as-is.
  - Exception: `alcohol.Controller.js` `addAlcohol`/`updateAlcohol` returned 400 on any error — after removal the central handler returns 400 for `ValidationError`/`CastError`, which is the same behaviour.
  - Where a `findById`/`findOne`/`findByIdAndUpdate`/`findByIdAndDelete` result is used without a null check, add `if (!doc) return res.status(404).json({ success: false, message: "<Entity> not found" });` (check `deleteProduct`, `getProductById`, `updateProduct` in `product.Controller.js` and the `oil.Controller.js` handlers).

  Example — before:
  ```js
  export const getAlcohol = async (req, res) => {
    try {
      const alcohols = await Alcohol.find();
      res.status(200).json(alcohols);
    } catch (error) {
      res.status(500).json({ message: error.message });
    }
  };
  ```
  After:
  ```js
  export const getAlcohol = async (req, res) => {
    const alcohols = await Alcohol.find();
    res.status(200).json(alcohols);
  };
  ```

- [ ] **Step 4: Schema constraints.** Add exactly these (keep everything else):
  - `alcohol.model.js`: `name`/`type` `trim: true`; `quantity`, `cost` `min: 0`.
  - `bottle.model.js`: `name` `trim: true`; `capacity`, `cost`, `quantity` `min: 0`.
  - `oil.model.js`: `oil_name` `trim: true`; `oil_cost`, `oil_quantity` `min: 0`.
  - `product.model.js`: `p_name` `trim: true`; `size_list[].price` `min: 0`; `p_offer_percentage`, `oil_percentage`, `alcohol_percentage` `min: 0, max: 100`.
  - `customer.model.js`: `name`, `phone` `trim: true`.

- [ ] **Step 5: Run, expect PASS** — `npm test` → all passing. `grep -rn "catch" backend/controller` → no matches.

- [ ] **Step 6: Commit**

```bash
git add backend tests
git commit -m "refactor: central error handling in controllers, schema min/trim validation"
```

---

### Task 4: Frontend — same-origin API, login page, auth guard, launcher

**Files:**
- Modify: all 19 occurrences of `http://localhost:5000/api` under `frontend/`; `frontend/js/navbar.js`; `Run System.bat`
- Create: `frontend/html/login.html`

**Interfaces:**
- Consumes: `POST /api/auth/login`, `POST /api/auth/logout`, `GET /api/auth/me` (Task 2 contract). Pages are served at `/admin/html/*.html`; relative `../css`, `../js` links keep working.

- [ ] **Step 1: Replace base URLs**

```bash
grep -rl "http://localhost:5000/api" frontend | xargs sed -i 's#http://localhost:5000/api#/api#g'
grep -rn "localhost:5000" frontend   # expect no output
```

- [ ] **Step 2: `frontend/html/login.html`** (Arabic RTL like the other pages; reuse `../css/style.css` classes — open `add_oil.html` first and mirror its form/card/button class names)

```html
<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>تسجيل الدخول</title>
  <link rel="stylesheet" href="../css/style.css" />
</head>
<body>
  <main class="container">
    <h1>تسجيل الدخول</h1>
    <form id="loginForm">
      <label for="username">اسم المستخدم</label>
      <input id="username" name="username" autocomplete="username" required />
      <label for="password">كلمة المرور</label>
      <input id="password" name="password" type="password" autocomplete="current-password" required />
      <p id="error" role="alert" hidden></p>
      <button type="submit">دخول</button>
    </form>
  </main>
  <script>
    document.getElementById("loginForm").addEventListener("submit", async (e) => {
      e.preventDefault();
      const err = document.getElementById("error");
      err.hidden = true;
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: e.target.username.value,
          password: e.target.password.value,
        }),
      });
      if (res.ok) return location.replace("index.html");
      err.textContent = res.status === 429
        ? "محاولات كثيرة، حاول لاحقًا"
        : "اسم المستخدم أو كلمة المرور غير صحيحة";
      err.hidden = false;
    });
  </script>
</body>
</html>
```

- [ ] **Step 3: Auth guard + logout in `frontend/js/navbar.js`.** Add a logout item at the end of the `<ul>` in `buildNavbarHTML()`:
```js
          <li><a class="nav-link" href="#" id="logoutLink">تسجيل الخروج</a></li>
```
Replace the `DOMContentLoaded` handler with:
```js
document.addEventListener("DOMContentLoaded", async function () {
  const res = await fetch("/api/auth/me");
  if (res.status === 401) return location.replace("login.html");

  const navbarContainer = document.getElementById("navbar");
  if (navbarContainer) {
    navbarContainer.innerHTML = buildNavbarHTML();
    document.getElementById("logoutLink").addEventListener("click", async (e) => {
      e.preventDefault();
      await fetch("/api/auth/logout", { method: "POST" });
      location.replace("login.html");
    });
  }
});
```
Confirm every admin page loads `navbar.js` (all 14 pages under `frontend/html` except `login.html` do today).

- [ ] **Step 4: `Run System.bat`** (full rewrite)

```bat
@echo off
cd /d "%~dp0"
start "Nsamat server" cmd /k "npm run dev"
timeout /t 3 >nul
start http://localhost:5000/admin/html/index.html
```

- [ ] **Step 5: Manual check.** `npm run dev`, open `http://localhost:5000/admin/html/index.html`:
  - Redirects to `login.html`; wrong password shows the error; the `.env` admin logs in and lands on `index.html`.
  - Every nav page loads its data (products, oils, bottles, orders, reports, dashboard charts) with no console CSP errors and no 401s.
  - Place one POS order end-to-end on `index.html`.
  - Logout returns to login; `/api/products` in a new tab then returns 401.

- [ ] **Step 6: Commit**

```bash
git add frontend "Run System.bat"
git commit -m "feat: admin login page, auth guard, same-origin API URLs"
```

---

### Task 5: Final verification

- [ ] `npm test` — all passing, output captured.
- [ ] `npm ls pkj mongodb` → empty; `npm ls express` → 5.x.
- [ ] `git grep -nE "mongodb\+srv|MONGO_URI\)"` → no hits in tracked code (no URI logging, no Atlas).
- [ ] `git status` → `.env` not staged.
- [ ] Run `superpowers:requesting-code-review` on the branch diff.
