# Admin redesign — professional POS and reporting UI (design)

Date: 2026-09-29 · Branch: `admin-redesign` · Status: awaiting spec review

## 1. Goal

Replace the current admin (plain HTML pages in `frontend/`) with a professional,
mobile-friendly admin built on React, Vite, JavaScript, Tailwind and shadcn/ui.
The POS becomes fast and touch-friendly; dashboard, reports and orders become
readable on a phone. Right-to-left Arabic stays the default.

Decisions made with the owner:
- Scope: every admin page (not only POS and reports).
- Stack: React + Vite + JavaScript + Tailwind + shadcn/ui.
- Rollout: replace in place, at the same `/admin` path, built on a branch so
  `main` keeps the old admin until the new one has parity.

## 2. Non-goals

- No new reports. The existing reports keep their data, endpoints and meaning.
- No backend behaviour changes. `/api/*` routes, the session cookie, stock and
  order logic are untouched. The only server change is how `/admin` is served.
- No storefront changes.
- No TypeScript (the rest of the project is plain JavaScript).

## 3. Architecture

- New folder `admin/` is the Vite app:
  `src/app` (router, providers, shell), `src/pages`, `src/components/ui`
  (shadcn), `src/components` (shared pieces), `src/lib` (api client, formatting,
  Arabic strings, cart math), `src/hooks`.
- `vite build` writes `admin/dist`. Express serves it at `/admin` with an
  `index.html` fallback so client routes survive a refresh. Same origin, so no
  CORS and the existing httpOnly session cookie keeps working.
- Dev: Vite dev server proxies `/api` to port 5000.
- Root scripts: `dev:admin`, `build:admin`. `npm start` serves `admin/dist`;
  if it is missing the server logs a clear "run npm run build:admin" message.
  `Run System.bat` builds first. Deployment (later) needs the build step.
- Routing: react-router. Login is a route; a 401 from any `/api` call returns
  to it (replaces the current `window.fetch` wrapper in `navbar.js`).
- Data: one small fetch wrapper plus TanStack Query for lists, caching and the
  60-second pending-orders poll.
- Forms: react-hook-form + zod through shadcn `Form`.
- Charts: shadcn charts (Recharts) replace the vendored Chart.js.
- Fonts: self-hosted through the `@fontsource` packages (IBM Plex Sans Arabic is
  already installed), which removes the Google Fonts dependency.
- Security: React escapes text by default, which removes the unescaped product
  name/image injection in today's POS. No `dangerouslySetInnerHTML`. The CSV
  export keeps its formula-injection guard (leading quote on formula-like cells).
- The app is served under the existing CSP. Vite emits external module scripts
  only, so the admin no longer needs `'unsafe-inline'`; tightening the global
  CSP is a follow-up because the storefront still uses inline scripts.

## 4. Design system

Style: clean, dense, functional (Minimalism / Swiss), tuned for a shop counter.
Light theme by default, dark theme supported, toggle in the user menu, choice
remembered.

- Tokens as CSS variables (shadcn convention): background, foreground, card,
  muted, border, ring, primary (brand teal, kept from today's `#0c6e63`),
  destructive, and the six order-status colour pairs (pending, completed,
  canceled, ready, in delivery, uncollected) kept with their current meaning.
- Spacing on Tailwind's 4px scale; type scale 12/14/16/20/24/30; base text 16px
  on mobile inputs (prevents iOS zoom).
- Density: dense tables and compact rows on desktop; on touch every interactive
  element is at least 44×44px with at least 8px between neighbours.
- Contrast at least 4.5:1 for text, visible focus rings everywhere, status is
  never conveyed by colour alone (icon or label too), `prefers-reduced-motion`
  respected. Motion is subtle (150–250ms transitions), no decorative animation.
- Icons are Lucide SVGs, never emoji.
- RTL: `dir="rtl"`, Tailwind logical utilities (`ms-`, `me-`, `ps-`, `pe-`,
  `start-`, `end-`). Numbers, phones and prices render left-to-right inside
  right-to-left text (`dir="ltr"` on those cells), as today.
- Feedback: sonner toasts replace every `alert()`; AlertDialog replaces every
  `confirm()`; destructive actions always confirm.

## 5. App shell and navigation

- Desktop (≥1024px): collapsible right-hand sidebar with the 15 links grouped —
  Sales (POS, Orders, Interest requests), Catalogue (Products, Oils, Bottles,
  Alcohols, Designers, Categories, Bulk tagging), Insights (Dashboard, Reports),
  Store (Storefront, Pages, Promotions, Settings). Pending-orders badge on Orders.
- Mobile (<1024px): bottom tab bar with POS, Orders, Products, Reports and More;
  More opens a sheet with the remaining pages. Top bar shows page title, the
  pending-orders badge and the user menu (theme, logout).
- The "add new" hover dropdown is replaced by a tap-friendly "+" menu and page
  header actions.
- Every page has a consistent header (title, primary action, filters).

## 6. POS (highest priority)

Existing behaviour is preserved: products, oils and bottles, size selection,
mandatory bottle assignment, price override, customer lookup by phone, server-
side stock deduction and owed-stock rules, `POST /api/orders`.

- Desktop: two panes. Left: search box, category/designer filter chips, product
  grid with large image cards. Right: sticky cart with line items, totals and a
  full-width Checkout button.
- Mobile: full-screen catalogue with a sticky bottom cart bar (item count and
  total) that opens the cart as a bottom sheet. Search stays pinned at the top.
- Quick add: tapping a card adds the default size at quantity 1; a size picker
  appears only when the product has several sizes. Cart lines have − / + steppers
  (no free-typing required), a bottle picker, an editable price, and swipe or
  button remove with undo toast.
- Customer: one combobox (search by phone or name, create-on-the-fly) instead of
  the phone check, list modal and name field spread over three controls.
- Payment method: the selector is shown only if the order API supports more than
  Cash (verified in the plan); otherwise Cash stays fixed as today.
- Checkout: validation errors inline next to the field; double-submit guard kept;
  success opens a confirmation dialog with order number, totals, a print button
  (`window.print` with a print stylesheet for receipts) and "New sale", instead
  of `alert()` and a page reload.
- Keyboard: `/` focuses search, Enter adds the first match, Ctrl+Enter checks out.

## 7. Dashboard, reports and orders

Data and endpoints unchanged; presentation rebuilt.

- Dashboard: KPI cards (2 columns on phone, 4 on desktop) and charts that resize;
  date presets as a scrollable chip row.
- Reports: same four tabs (Sales, Products, Inventory, Customers) as a scrollable
  tab list. Filters collapse into a "Filters" sheet on mobile. Tables use the
  shadcn DataTable (sortable, sticky header, pagination) on desktop and switch to
  a stacked card list under 768px so nothing scrolls sideways. Inline stock
  editing in the inventory report and CSV export are kept.
- Orders: status filter chips with counts, search, list as cards on mobile; order
  details as a single-column page with a status stepper and the confirm-order
  action for unconfirmed online orders. Customer-controlled text is always
  rendered as text.
- Interest requests: same list treatment, with WhatsApp links kept.

## 8. Catalogue, storefront and settings pages

- Products, oils, bottles, alcohols: list pages use DataTable/cards with the
  visibility toggle and inline actions; add/edit use one shared form pattern with
  sections, sticky Save bar on mobile, image upload with preview, and field-level
  errors.
- Designers (brands), categories, bulk tagging, pages (with markup toolbar and
  live preview via `/api/pages/preview`), promotions (ads and codes), storefront
  content, settings (identity, colours with contrast checks, delivery, SEO,
  texts): rebuilt with the same components and behaviour, including the current
  validation and reorder controls.
- The current admin-configurable rule stands: every store-facing detail remains
  editable from the admin, nothing hard-coded.

## 9. Testing

- Backend `node --test` suite stays as is and must keep passing (no API changes).
- Unit tests (Vitest) for pure logic: cart math and line validation, price/phone
  formatting, CSV formula guard.
- Playwright e2e (existing harness) rewritten page by page against the new UI,
  using accessible roles and labels rather than the old ids. New mobile
  scenarios at 375px for POS checkout, reports (no horizontal page scroll), and
  navigation. The existing XSS assertions are ported to the new pages.
- Checks per page before it counts as done: 375 / 768 / 1024 / 1440px widths,
  keyboard-only pass, no console or CSP errors, RTL correct, light and dark.

## 10. Delivery phases (each ends green and reviewable)

1. Foundation: Vite app, Tailwind, shadcn, tokens, shell, login, auth, fetch
   wrapper, toasts, Express serving and build scripts.
2. POS.
3. Orders, order details, interest requests, dashboard, reports.
4. Products, oils, bottles, alcohols (lists and forms).
5. Designers, categories, bulk tagging, pages, promotions, storefront, settings.
6. Cutover: remove `frontend/` admin files, update `Run System.bat`, e2e and
   docs, run the full backend and e2e suites, then merge `admin-redesign`.

## 11. Risks

- Size: about 23 pages, so it is phased; phases 1–3 deliver the POS and reporting
  value the owner asked for first.
- Behaviour drift: business rules live on the server; the UI only presents them.
  Each page is compared with the old one before its phase closes.
- Test rewrite: the old e2e selectors do not carry over; budgeted per phase.
- Build step: production hosting will need `npm run build:admin` (noted for the
  deployment work that comes later).
