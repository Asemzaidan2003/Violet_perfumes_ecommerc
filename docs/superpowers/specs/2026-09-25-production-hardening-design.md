# Production Hardening — Design Spec

Status: approved in principle by user (2026-09-25), pending plan
Scope: sub-project 0 of Phase 3. Must land before the inventory engine
(`2026-09-22-inventory-stock-engine-design.md`) and the storefront, because a
public storefront will share this backend.

## Problem

- No authentication: every route (delete product, edit stock, list customers)
  is open to anyone who can reach the server.
- `server.js` logs `MONGO_URI` (credentials) on boot; `dns.setServers` hack
  exists only for Atlas SRV lookups.
- `cors()` allows every origin; frontend is served separately by live-server
  and hardcodes `http://localhost:5000/api` in 19 places.
- Every controller hand-rolls `try/catch` → `500 { error: error.message }`,
  leaking internals; bad ObjectIds return 500 instead of 400/404.
- Unused / junk dependencies: `pkj` (empty placeholder package), `mongodb`
  (mongoose bundles its own driver).
- No tests, no `start` script, `Run System.bat` hardcodes another user's path.

## Constraints

- Development and tests use **local MongoDB only**
  (`mongodb://127.0.0.1:27017/nsamat_dev`, tests use `nsamat_test`), run as a
  single-node replica set `rs0` so the inventory engine can use transactions.
  Never Atlas.
- Minimal dependencies (ponytail): Node stdlib first.

## Design

### Runtime & config
- Upgrade Express 4 → 5: async handler rejections reach the error middleware,
  so per-controller `try/catch` blocks are deleted.
- `backend/app.js` builds and exports the Express app (testable without
  listening); `backend/server.js` only connects to Mongo, then listens.
  Connect **before** listen; exit non-zero if the connection fails.
- Remove the `MONGO_URI` log and the `dns.setServers` hack.
- Required env: `MONGO_URI`, `PORT`, `SESSION_SECRET` (≥32 chars),
  `ADMIN_USERNAME`, `ADMIN_PASSWORD` (used only to seed the first admin).
  Optional: `NODE_ENV`, `ALLOWED_ORIGINS` (comma-separated, for the future
  storefront if served from another origin). Boot fails fast if a required
  var is missing. Ship `.env.example`; `.env` stays gitignored.
- Scripts: `start` (`node backend/server.js`), `dev` (nodemon), `test`
  (`node --test`).

### Same-origin frontend
- Express mounts `frontend/` as a whole at `/admin` (keeps its relative `../css`, `../js` links working), so pages live at `/admin/html/*.html`; `/` is reserved for the storefront
  and live-server is no longer needed.
- Replace every `http://localhost:5000/api` with the relative `/api`.
- CORS: disabled by default (same origin); enabled only for origins listed in
  `ALLOWED_ORIGINS`, with credentials.

### Authentication (admin/staff)
- `User` model: `username` (unique), `password_hash`, `role`
  (`admin` only for now).
- Passwords hashed with `crypto.scrypt` + random salt; compared with
  `crypto.timingSafeEqual`. No bcrypt dependency.
- Session: stateless signed token `userId.expiry.hmac` (HMAC-SHA256 with
  `SESSION_SECRET`) in an `HttpOnly`, `SameSite=Strict`, `Secure`-in-prod
  cookie, 12h expiry. No JWT library.
- Endpoints: `POST /api/auth/login`, `POST /api/auth/logout`,
  `GET /api/auth/me`.
- Login rate limit: in-memory counter, 5 failures / 15 min per IP
  (`ponytail:` single process; move to Mongo/Redis if horizontally scaled).
- First boot: if no users exist, seed one admin from
  `ADMIN_USERNAME`/`ADMIN_PASSWORD`.
- `requireAdmin` middleware on **all existing `/api/*` routes** except
  `/api/auth/*` and `/api/health`. Public storefront routes are added by the
  storefront spec, explicitly, as an allow-list.
- Admin UI: new `login.html`; `navbar.js` (already loaded on every admin
  page) calls `/api/auth/me` and redirects to login on 401, and adds a
  logout button.

### Errors & validation
- One error middleware: mongoose `CastError` → 400 "Invalid id",
  `ValidationError` → 400 with field messages, duplicate key 11000 → 409,
  everything else → 500 `"Server error"` (message logged, never returned in
  production). Unknown `/api/*` routes → 404 JSON.
- `findById` misses return 404 (fix controllers that currently return 200
  with `null`).
- `express.json({ limit: "100kb" })`.
- Mongoose schema validation is the validation layer (add `min: 0` on
  quantities/costs/prices, `trim` on names); no validation library.

### Security headers & ops
- `helmet` (one dependency, well-maintained) for standard security headers,
  with a CSP that allows the existing inline scripts/styles for now.
- `GET /api/health` → `{ ok: true, db: <mongoose readyState === 1> }`.
- Graceful shutdown on SIGTERM/SIGINT (close server, disconnect mongoose).
- `Run System.bat` uses `%~dp0` and starts only the backend
  (`npm run dev`) and then opens `http://localhost:%PORT%/admin/html/index.html`.

### Dependency cleanup
- Remove `pkj`, `mongodb`. Add `helmet`. Upgrade `express` to 5.

## Out of scope
- Deployment target / CI (hosting defaults to a managed Node platform + a
  production MongoDB decided later; only the `start` script and env contract
  are required for that).
- Multiple roles / staff permissions, password reset UI.
- Inventory engine, storefront, offers (separate specs).

## Testing
- `node --test` against the local `nsamat_test` DB (dropped per run), using
  the exported app on an ephemeral port with global `fetch` (no supertest).
- Covers: login success/failure, rate limit, protected route 401 without
  cookie / 200 with, tampered/expired token rejected, CastError → 400,
  unknown id → 404, health endpoint, password hash round-trip.
