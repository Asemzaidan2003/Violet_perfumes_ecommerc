# Admin Redesign Phase 3 — Orders, Interests, Dashboard, Reports Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the orders list, order details (with the online-order confirm flow), interest requests, dashboard and the four report tabs in the new React admin, mobile-first, with the same data, endpoints and business rules as the legacy pages.

**Architecture:** New pages under `admin/src/pages/{orders,interests,dashboard,reports}/` reuse a small shared component set built in Task 1 (page header, stat cards, responsive table that becomes cards on phones, status badges, empty/error states, confirm dialog, chart card). Pure logic (formatters, date presets, CSV, order filtering) lives in tested `admin/src/lib/*.js`. Charts use the shadcn chart component (Recharts). No backend changes.

**Tech Stack:** React 19, Vite, plain JavaScript, Tailwind v4, shadcn/ui, TanStack Query, react-router, Recharts (via shadcn `chart`), Vitest, Playwright e2e.

**Spec:** `docs/superpowers/specs/2026-09-29-admin-redesign-design.md` (sections 4, 7, 9; Phase 3 of section 10). Earlier plan: `docs/superpowers/plans/2026-09-29-admin-redesign-foundation-pos.md` (already implemented; its `admin/src` code is the base).

**Contract sheet (READ FIRST for every task):** `.superpowers/research/phase3-contracts.md` (git-ignored, ~440 lines). It is the exact per-page reference for layout strings, every API call with verified response shapes, business rules, e2e hooks and gotchas. The plan below says WHAT to build and how it is verified; the sheet says exactly how the legacy pages behave. Where the plan and the sheet disagree, the plan (it records deliberate changes) wins.

> **Plan style note:** phases 3-6 plans specify contracts, file structure, behaviours and required tests instead of pasting full source (a ruling recorded in the ledger: ~20 pages of verbatim JSX would not be reviewable). Every task ends with tests that pin the behaviour, and every task is gated by a task review.

## Global Constraints

- Plain JavaScript (`.js`/`.jsx`), never TypeScript; files under 500 lines; commit small and often; NO `Co-Authored-By` trailer; never read or print `.env`; backend tests/e2e use only local MongoDB.
- Arabic right-to-left with logical Tailwind utilities only (`ms-/me-/ps-/pe-/start-/end-/border-s/border-e/text-start/text-end/inset-x`); never `left-/right-/ml-/mr-/pl-/pr-/text-left/text-right` (allowed leftovers only inside generated `components/ui/*`: `left-[50%]` centering and sheet/`slide-*` animation names).
- Touch targets at least 44x44px and at least 8px between neighbours; text contrast at least 4.5:1 in light AND dark (check status badge colours and chart text); visible focus rings; `prefers-reduced-motion` respected; icons are Lucide SVGs, never emoji.
- No `alert()`/`confirm()` (sonner toasts and shadcn dialogs instead); no `dangerouslySetInnerHTML`; every customer/product/oil/bottle/alcohol/category string renders as text.
- Numbers, money, phones and dates render inside `<bdi dir="ltr">` (never `dir="ltr"` + `text-start` on a paragraph); money format is `money()` = en-US digits, 2 decimals, thousands comma, " JOD" suffix (port exactly from the sheet, section 4.3).
- Same-origin API only; `api()` from `@/lib/api`; server Arabic error messages are shown verbatim in toasts; empty-list 404s (`GET /api/bottles`) are treated as `[]`.
- No backend changes. Legacy pages and legacy e2e scenarios stay untouched until the cutover phase; legacy pages are still linked from `nav.js` until their new page exists, then the nav entry switches to a `to:` route.
- Every new page ships with an e2e scenario in `tests/e2e/admin-*.mjs` (registered in `tests/e2e/run.mjs`) that checks: desktop (1440) and phone (375) render with no sideways scroll, no console/CSP errors (`check(page)`), the page's own behaviours, and XSS inertness for its customer-controlled fields. Log in through the API helper (Task 1), not the login form.
- Run the affected unit tests, `npm run build:admin`, and the page's e2e (`E2E_ONLY=<regex> npm run test:e2e`) before committing a task; run the full suites (`npm test`, `npm run test:admin`, full `npm run test:e2e`) at the end of the phase.

## Review Focus

- Unconfirmed online orders (`stock_deducted:false`, status not canceled) must show a badge everywhere and can only go to `pending` or `canceled`; the 409 message from the server must reach the user verbatim and the select must revert — Tasks 2, 3.
- Confirm flow: lines match by index; blank quantity/price mean "no edit"; every line needs a bottle whose capacity equals the size; the confirm button must not double-submit; shortages are reported but never block — Task 3.
- Money/number correctness in KPI and report tables: `toFixed` on missing fields must never throw (legacy crashed); negative profits and negative (owed) stock display sensibly; empty periods and empty tables show empty states, not blanks — Tasks 5-8.
- CSV export: formula-injection guard exactly as legacy (prefix `'` for cells starting with `= + - @ TAB CR`, including negative numbers), quoting/escaping, BOM, filename per report — Task 6 unit tests.
- Date ranges: presets (today, week from Sunday, month, 30d, 90d), local-day boundaries, empty from/to falling back to server defaults — Task 6 unit tests.
- Hostile strings in product/oil/bottle/alcohol/category/customer/delivery/interest fields render literally, and the alcohol inline editor can be opened and saved back without mangling values containing quotes — Tasks 3, 4, 5, 7, 8 e2e.
- Server failures (500, offline) show an in-page error with a retry button and never a blank page or an unhandled exception — every page task.

---

## File Structure

Create:
- `admin/src/lib/format.js` (extend), `admin/src/lib/dates.js`, `admin/src/lib/csv.js`, `admin/src/lib/orders.js` (+ `*.test.js` each)
- `admin/src/components/{page-header,stat-card,empty-state,error-state,status-badge,confirm-dialog,whatsapp-link,responsive-table,chart-card}.jsx`
- `admin/src/components/ui/{table,tabs,chart,checkbox,switch,tooltip}.jsx` (generated by shadcn as needed)
- `admin/src/pages/orders/{OrdersPage,OrderDetailsPage,useOrders}.jsx|js`
- `admin/src/pages/interests/InterestsPage.jsx`
- `admin/src/pages/dashboard/DashboardPage.jsx`
- `admin/src/pages/reports/{ReportsPage,SalesTab,ProductsTab,InventoryTab,CustomersTab,ReportFilters}.jsx`
- `tests/e2e/admin-helpers.mjs`, `tests/e2e/admin-orders.mjs`, `tests/e2e/admin-insights.mjs`

Modify: `admin/src/app/App.jsx` (routes), `admin/src/app/nav.js` (legacy → `to`), `admin/src/app/Shell.jsx` (tab ids/labels only if needed), `tests/e2e/run.mjs` (register scenarios, `E2E_ONLY` filter), `admin/package.json` (recharts).

---

### Task 1: Shared foundation — components, formatters, chart dependency, e2e helpers

**Files:**
- Create: the shared components and libs listed above (except pages); `tests/e2e/admin-helpers.mjs`
- Modify: `tests/e2e/run.mjs` (E2E_ONLY filter), `admin/package.json`/lock (recharts through shadcn chart)
- Test: `admin/src/lib/format.test.js`

**Interfaces:**
- Produces (exact names, later tasks consume them):
  - `format.js` (keep `money`, `shortId`): `num(n)`, `pct(n)` (`+`/`-` sign rules per sheet 4.3), `trendClass(n)` ("up"|"down"|"flat"), `trendArrow(n)`, `fmtDate(d)` (en-GB), `fmtDateShort("YYYY-MM-DD")` → "DD/MM", `fmtDateTime(d)`, `toDateInputValue(d)` (local YYYY-MM-DD), `arabicStatus(s)`, `paymentLabel(m)`; constants `STATUSES` (ordered list of `{value, label}` per sheet 0.6), `CHART_COLORS`; `waLink(phone)` (digits, strip one leading 0, `https://wa.me/962…`).
  - Components: `<PageHeader eyebrow title description actions />`, `<StatCard label value sub tone="default|accent|warning|danger" trend />`, `<EmptyState icon title hint />`, `<ErrorState title hint onRetry />`, `<StatusBadge status />` (all six order statuses + `unconfirmed`, plus a generic `<Pill tone>`; colours meet 4.5:1 in both themes), `<ConfirmDialog open title description confirmLabel destructive onConfirm onOpenChange />`, `<WhatsAppLink phone name />`, `<ResponsiveTable columns rows rowKey emptyState renderCard? />` (table at >=768px; stacked cards below; `columns:[{key,header,cell?,align?,className?}]`), `<ChartCard title description>{children}</ChartCard>` (fixed-height responsive container).
  - `tests/e2e/admin-helpers.mjs`: `openAdmin(page, baseUrl, admin, path)` (API login, then `goto(baseUrl + "/admin" + path)`), `noSideScroll(page)`, `assertPageIsXssSafe(page, payloads)` (no `window.__xss`, zero `img[onerror], svg[onload], [onmouseover]`, payloads visible literally in `body.innerText`, every `a[href^="https://wa.me/"]` matches `^https://wa\.me/962\d{9}$`).
  - `run.mjs`: `scenario(name, fn)` skips (does not run, does not fail) when `process.env.E2E_ONLY` is set and `new RegExp(E2E_ONLY).test(name)` is false; prints `SKIP:` lines; exit status ignores skipped.

- [ ] **Step 1: Write failing unit tests** in `admin/src/lib/format.test.js` for every new formatter with the exact expectations in the contract sheet (4.3, 0.6): `money` unchanged; `num(1234.5)` → `"1,234.5"`; `pct(12.34)` → `"+12.3%"`, `pct(-5)` → `"-5.0%"`, `pct(0)` → `"0.0%"`; trend helpers; `fmtDate("2026-09-05T10:00:00Z")` → `"05/09/2026"`; `fmtDateShort("2026-07-20")` → `"20/07"`; `toDateInputValue(new Date(2026,8,5))` → `"2026-09-05"`; `arabicStatus("in delivery")` → `"قيد التوصيل"`, unknown passes through; `paymentLabel("Cash")` → `"كاش"`, `"Credit"` → `"بطاقة"`; `waLink("0791234567")` → `"https://wa.me/962791234567"`; `STATUSES` has six entries in the sheet's order. Money/`num`/dates must never throw on `undefined`/`null`/`""`.
- [ ] **Step 2: Run** `npm run test:admin` — expect failures for the missing exports.
- [ ] **Step 3: Implement** `format.js`, then the components (read `admin/src/components/ui/*` and the phase-1 pages for the established look: card surfaces, `h-11` controls, `gap-2` spacing, `<bdi dir="ltr">` for numbers). Add shadcn `table tabs chart checkbox switch tooltip` (`npx shadcn@latest add -y --overwrite …` from `admin/`; then re-run the RTL grep on `admin/src/components/ui` and convert physical classes; keep the `cn` import from `@/lib/utils`, not the stray `cn` package). Status colours: define six order-status colour pairs plus `unconfirmed` as CSS tokens in `admin/src/index.css` (light and dark), each text/background pair at least 4.5:1 — compute the ratios and put them in the report.
- [ ] **Step 4: Implement the e2e helpers and the `E2E_ONLY` filter** in `run.mjs`; verify with `E2E_ONLY="New admin POS" npm run test:e2e` that only the phase-1 POS scenarios run and pass (the build step still runs first).
- [ ] **Step 5: Verify** `npm run test:admin`, `npm run build:admin`, RTL grep on `admin/src`; commit "feat(admin): shared components, formatters and e2e helpers for the data pages".

---

### Task 2: Orders list page (`/orders`)

**Files:**
- Create: `admin/src/lib/orders.js` (+ `orders.test.js`), `admin/src/pages/orders/{OrdersPage.jsx,useOrders.js}`, `tests/e2e/admin-orders.mjs`
- Modify: `admin/src/app/App.jsx` (route `/orders`), `admin/src/app/nav.js` (Orders → `to: "/orders"`), `tests/e2e/run.mjs` (register)

**Interfaces:**
- Consumes: Task 1 components/formatters, `api`, `listOf`.
- Produces: `orders.js` pure helpers: `resolveCustomer(order, customersById)` → `{name, phone}` (sheet 1.3: online orders prefer the delivery snapshot); `isUnconfirmed(order)`; `filterOrders(orders, {status, payment, from, to, query}, customersById, now)` (AND semantics per sheet 1.3 but with local-day boundaries for both `from` and `to`; search matches name or phone, and normalises Arabic-Indic digits in the query); `isToday(order, now)`; `orderTotals(list)` → `{sales, profit}` (sales over ALL filtered rows incl. canceled; profit over `completed` only). Hook `useOrders()` → `{orders, customersById, loading, error, refetch}` (one `GET /api/orders` + one `GET /api/customers`).

Requirements (all per sheet section 1 unless stated):
- Header "قائمة الطلبات", count "N طلب". Filters: status (incl. "بانتظار التأكيد"), from/to dates, payment, search, buttons "فلترة" (apply) and "إعادة تعيين" (reset shows ALL orders, not today). Filters apply on the apply button and on Enter in the search box. On phones the filters live in a collapsible panel/sheet opened by a "الفلاتر" button showing the active-filter count.
- Default view = today's orders only, with a visible "اليوم" chip and a "عرض الكل" action; `?filter=<value>` deep link (POS uses `unconfirmed`) preselects and applies the status filter; an unknown value shows all.
- Two stat cards (total sales, total profit). Table (>=768px) / cards (<768px) with all columns in the sheet; a `StatusBadge` per row; online orders show the "الموقع" badge and unconfirmed orders the "بانتظار التأكيد" badge; WhatsApp link only for online orders with a phone; "عرض" links to `/orders/:id` (in-app route).
- Status change through an accessible select (`aria-label` "حالة طلب {name}", 44px): on success update the row and show a toast; on error show the server's Arabic message verbatim (409 rules) and revert; canceling asks for confirmation through `ConfirmDialog` (new in the redesign; the legacy had none).
- Loading skeleton, empty state ("لا توجد طلبات مطابقة" + hint), error state with retry.

- [ ] **Step 1: Write failing unit tests** in `orders.test.js` covering: `resolveCustomer` (pos with/without linked customer, online snapshot wins, missing → "-"), `isUnconfirmed`, `filterOrders` for each filter and their combination incl. the `unconfirmed` pseudo-status, date bounds inclusive of the whole `to` day in local time, search by name (case-insensitive) and by phone typed with Arabic-Indic digits, `orderTotals` (canceled counted in sales, profit only for completed), `isToday` across midnight.
- [ ] **Step 2: Run** them and see them fail; implement `orders.js`; see them pass.
- [ ] **Step 3: Build `useOrders`, `OrdersPage`, route and nav entry.**
- [ ] **Step 4: Write the e2e scenarios** in `tests/e2e/admin-orders.mjs` (function `registerAdminOrdersScenarios({ scenario, openPage, check, baseUrl, admin })`; each scenario seeds its own data, cleans up in `finally`, and uses the helpers): (a) "Orders page (new admin): today's default, filters, status change" — seed one POS-completed order and one unconfirmed online order (place it through `POST /api/store/orders` the way `admin-online.mjs` does), open `/orders`, assert both rows, the "الموقع" and "بانتظار التأكيد" badges, apply the unconfirmed filter, reset, change a confirmed order's status through the select and assert the API state, try an illegal transition on the unconfirmed order and assert the toast shows the server's Arabic 409 message and the select reverts; (b) "Orders page (new admin): phone layout" at 375px — cards, no sideways scroll, controls >= 44px, deep link `?filter=unconfirmed`; (c) "Orders page (new admin): hostile names are inert" — delivery name `"><img src=x onerror=window.__xss=1>`, phone `0781234567`, `assertPageIsXssSafe`. Register in `run.mjs` and run `E2E_ONLY="Orders page" npm run test:e2e`.
- [ ] **Step 5: Verify** unit tests, build, RTL grep; commit "feat(admin): orders list page".

---

### Task 3: Order details page and the confirm flow (`/orders/:id`)

**Files:**
- Create: `admin/src/pages/orders/OrderDetailsPage.jsx`
- Modify: `admin/src/app/App.jsx` (route `/orders/:id`), `tests/e2e/admin-orders.mjs`

**Interfaces:**
- Consumes: Task 1/2 pieces, `api`, `listOf("/bottles")`, `bottlesFor` from `@/lib/cart` (capacity match).
- Produces: route `/orders/:id`; stable DOM hooks kept from the legacy page so tests and muscle memory carry over: element `id="deliveryInfo"` (delivery card), `id="deliveryFeeInput"`, `id="confirmBtn"`, per-line `id="qty-{i}"`, `id="price-{i}"`, `id="bottle-{i}"`; the confirmed state shows the exact text "تم الخصم".

Requirements (sheet section 2):
- Summary card with all ten items; the raw English payment value becomes `paymentLabel`; total cost formatted with `money`; stock line: canceled → "ملغي (أُعيد المخزون)", unconfirmed → "بانتظار التأكيد", else "تم الخصم". Delivery card (online with delivery data) with WhatsApp link. Products table (cards on phones) with all columns; back link "الرجوع إلى الطلبات".
- Confirm mode (online, `stock_deducted===false`, not canceled): editable rows (quantity, price, bottle select filtered to `capacity === parseFloat(size)` and labelled "name (المتوفر: quantity)") plus the delivery-fee input (prefilled). Client validation: every line needs a bottle (inline error "يرجى اختيار زجاجة لكل منتج", no request). Submit posts `{lines:[{bottle_id, quantity, price}], delivery_fee}` with raw input strings (blank = no edit, per server). The button is disabled while pending and guarded by a synchronous ref against double submit. Success: toast "تم تأكيد الطلب وخصم المخزون" and, when `shortages` is non-empty, a persistent warning block listing `item: المطلوب X، المتوفر Y` with the corrected wording (stock becomes negative/owed, not "zeroed"); then refetch the order so the page shows the read-only state. Errors: server message verbatim.
- 404 order (`{message:"Order not found"}` with no `success`) and bad id (400) show an ErrorState ("الطلب غير موجود" / server message), never a crash. `GET /api/bottles` 404 → `[]` and the select then offers only the placeholder with a clear "لا توجد زجاجة بهذه السعة" hint.
- Read-only orders never show the form; canceled online orders show no confirm bar.

- [ ] **Step 1: Write the e2e scenarios first** (extend `admin-orders.mjs`): (a) "Order details (new admin): confirm an online order" — port `admin-online.mjs` "Admin sees the online order" for the new UI: place an online order, open `/orders/:id`, wait for `#deliveryInfo`, assert name/city/address text and `#deliveryFeeInput` value, select the only fitting bottle in `#bottle-0`, click `#confirmBtn`, wait for the 200 confirm response, assert text "تم الخصم", assert via API `stock_deducted===true` and a linked `customer_id`, and that the pending count returned to its previous value; (b) "Order details (new admin): confirm needs a bottle and reports shortages" — clicking confirm without a bottle shows the inline error and sends no request; an order needing more stock than available confirms and shows the shortage warning with the negative-stock wording; (c) "Order details (new admin): hostile strings are inert" — port the four-payload XSS scenario (delivery name/address/notes, product name, bottle name, order notes) including the bottle option label containing the literal payload; (d) 404 and bad-id pages show the ErrorState; (e) 375px layout with no sideways scroll and 44px controls. Run them and see them fail (page missing).
- [ ] **Step 2: Implement** the page and route; make the scenarios pass with `E2E_ONLY="Order details" npm run test:e2e`.
- [ ] **Step 3: Verify** build and RTL grep; commit "feat(admin): order details page with the online-order confirm flow".

---

### Task 4: Interest requests page (`/interests`)

**Files:**
- Create: `admin/src/pages/interests/InterestsPage.jsx`
- Modify: `admin/src/app/App.jsx`, `admin/src/app/nav.js` (Interests → route), `tests/e2e/admin-orders.mjs` (or `admin-insights.mjs`)

Requirements (sheet section 3): status filter (الكل / جديد / تم التواصل / مغلق) that refetches on change; rows (cards on phones) with product, size, name, phone (LTR), note, date, `StatusBadge`-style pill (new/contacted/closed colours), actions: WhatsApp link when phone present, "تم التواصل" (hidden when contacted), "إغلاق" (hidden when closed) — each 44px with aria-labels from the sheet; PUT `/api/interests/:id {status}`, then refetch with the current filter; errors as toasts with the server's message; empty state "لا توجد طلبات اهتمام"; error state with retry; the server caps results at 500 (mention it in a footer hint when 500 are returned). All strings render as text.

- [ ] **Step 1: Write the e2e scenario first**: seed three interests (new, contacted, closed) and one hostile (port the `admin-online.mjs` interest XSS payloads), assert the filter, the action buttons per status, that "تم التواصل" moves a row and updates the API, `assertPageIsXssSafe`, and the 375px layout. See it fail.
- [ ] **Step 2: Implement** page/route/nav; run `E2E_ONLY="Interest" npm run test:e2e`; verify build; commit "feat(admin): interest requests page".

---

### Task 5: Dashboard (`/dashboard`)

**Files:**
- Create: `admin/src/pages/dashboard/DashboardPage.jsx`, `tests/e2e/admin-insights.mjs`
- Modify: `admin/src/app/App.jsx`, `admin/src/app/nav.js`, `tests/e2e/run.mjs` (register `registerAdminInsightsScenarios`)

Requirements (sheet section 4): one `GET /api/reports/dashboard`; header with "آخر تحديث" time and a refresh button; four KPI cards with trend arrows/percentages; four ops cards (pending with warning tone when >0 and sub-label clarifying it includes unconfirmed orders, inventory capital, low-stock count with danger tone, new customers); sales-trend line chart (14 days, revenue + profit, `DD/MM` labels, tooltips, legend bottom) and order-status doughnut (Arabic labels) in `ChartCard`s using the shadcn chart component and theme-aware colours from `CHART_COLORS`; top-products list (rank, name, quantity, revenue); low-stock list (oils first then bottles; units ML / قطعة); recent-orders table (cards on phones) with links "عرض جميع الطلبات" (`/orders`) and "عرض الكل" for stock (`/reports?tab=inventory`). Error state replaces the whole page content with a retry (fix the legacy quirk that left other sections on loading placeholders). Every numeric access is null-safe. Charts have text alternatives (an `aria-label` summary and the data also visible in lists/tables).

- [ ] **Step 1: Write the e2e scenario first**: seed a completed order today, an unconfirmed online order (excluded), an oil below 100 ML, a bottle below 20, a hostile product name and hostile oil/bottle names; assert KPI values match the API (`GET /api/reports/dashboard`), the low-stock lists show the hostile names literally with `assertPageIsXssSafe`, the pending card sub-label, both charts render (canvas/SVG present with non-zero size), the recent-orders row, the 375px layout (no sideways scroll), and that an API failure (route the request to 500 with Playwright) shows the ErrorState with a working retry. See it fail.
- [ ] **Step 2: Implement** page/route/nav; run `E2E_ONLY="Dashboard" npm run test:e2e`; verify build; commit "feat(admin): dashboard page".

---

### Task 6: Reports shell, dates and CSV libs, Sales tab

**Files:**
- Create: `admin/src/lib/{dates.js,csv.js}` (+ tests), `admin/src/pages/reports/{ReportsPage.jsx,ReportFilters.jsx,SalesTab.jsx}`
- Modify: `admin/src/app/App.jsx` (route `/reports`), `admin/src/app/nav.js`, `tests/e2e/admin-insights.mjs`

**Interfaces:**
- Produces: `dates.js`: `presetRange(preset, now)` → `{from, to}` as local `YYYY-MM-DD` strings for `today|week|month|30d|90d` (week starts Sunday; 30d = now−29; 90d = now−89; month = 1st of month); `reportQuery({from,to,status,...extra})` → query string with only truthy values. `csv.js`: `toCsv(headers, rows)` → string (each cell: `String(v ?? "")`, prefix `'` when `/^[=+\-@\t\r]/`, quote when `/[",\n]/` with doubled quotes, `,` and `\n` joins, BOM prefix) and `downloadCsv(filename, headers, rows)` (Blob + temporary anchor + `URL.revokeObjectURL`). `ReportsPage` renders tabs (`sales|products|inventory|customers`) driven by `?tab=`, the shared `ReportFilters` (from, to, status with the four legacy options + hint that canceled reports are empty by design, presets as a scrollable chip row with the active preset highlighted, "تطبيق" button; hidden on the inventory tab), default preset `30d`. Tab triggers keep `data-tab="{name}"` and role `tab`.

Requirements: Sales tab per sheet 5.3: six stat cards, group-by select (day/week/month), combo chart (revenue and cost bars, profit line), detail table (cards on phones) and "تصدير CSV" using the exact legacy headers/filename (`sales-report.csv`, `Period,Revenue,Cost,Profit,Orders,Avg Order Value`). Loading skeletons, empty ("لا توجد بيانات لهذه الفترة") and error states with retry. Switching tabs refetches; filters apply on "تطبيق" (and presets apply immediately).

- [ ] **Step 1: Write failing unit tests** for `dates.js` (each preset for a fixed `now`, e.g. Wednesday 2026-09-30: week → `2026-09-27`; month → `2026-09-01`; 30d → `2026-09-01`; 90d → `2026-07-03`; today), `reportQuery`, and `csv.js` (`=1+1`, `+1`, `-1`, `@x`, tab, CR guarded; quotes, commas, newlines quoted; `null`/`undefined` → empty; BOM present; headers guarded too). Run and see them fail; implement; see them pass.
- [ ] **Step 2: Write the e2e scenario first** (`admin-insights.mjs`): seed completed orders across a few days, open `/reports`, assert the six stat values equal `GET /api/reports/sales?...`, presets change the query (capture the request URL), group-by week changes the table, the CSV download (Playwright `waitForEvent("download")`) content starts with the BOM and header line and guards a hostile product name starting with `=`, the empty state for a range with no orders, `?tab=inventory` opens the inventory tab (placeholder until Task 8: skip this assertion until then, or assert the tab is selected), no sideways scroll at 375px with scrollable tab list and presets. See it fail.
- [ ] **Step 3: Implement** libs, shell, Sales tab, route, nav; run unit tests and `E2E_ONLY="Reports" npm run test:e2e`; verify build; commit "feat(admin): reports shell with the Sales tab, date presets and CSV export".

---

### Task 7: Products and Customers report tabs

**Files:**
- Create: `admin/src/pages/reports/{ProductsTab.jsx,CustomersTab.jsx}`
- Modify: `admin/src/pages/reports/ReportsPage.jsx` (mount tabs), `tests/e2e/admin-insights.mjs`

Requirements: Products tab (sheet 5.4): note "التقارير حسب المنتج قبل خصم الأكواد", sort-by (revenue/quantity/profit) and limit (5/10/20, default 10) controls, horizontal bar chart of top products, pie chart by category (labels from `by_category`), product details table (name, category or "-", quantity, revenue, cost, profit, margin `toFixed(1)%`), size table, CSV `products-report.csv` (`Product,Category,Quantity,Revenue,Cost,Profit,Margin %`). Customers tab (sheet 5.6): three stat cards (total customers, walk-in orders, top spender with sub-label), bar chart of new customers, doughnut of customer types (`individual` → "أفراد", `store` → "محلات"), top-customers table (name, phone, type label, orders, total spent, average, last order `fmtDate`; missing customer → "-") with CSV `customers-report.csv` (`Name,Phone,Type,Orders,Total Spent,Avg Order,Last Order`). Limit param 15. All strings text-safe; null-safe numbers; each tab has loading/empty/error states.

- [ ] **Step 1: Write the e2e scenarios first**: (a) products tab with two products/categories, hostile product name and category, assert table values against `GET /api/reports/products`, sort by quantity reorders, CSV content, `assertPageIsXssSafe`; (b) customers tab with a completed POS order linked to a customer named with the hostile payload `"><img src=x onerror=window.__xss=1>` (port `admin-online.mjs` "XSS inert" for the customers tab — click the `data-tab="customers"` trigger), assert stat values and CSV, and that a deleted customer's row shows "-"; (c) 375px layout for both tabs. See them fail.
- [ ] **Step 2: Implement**; run `E2E_ONLY="Reports" npm run test:e2e`; verify build; commit "feat(admin): products and customers report tabs".

---

### Task 8: Inventory report tab with alcohol inline editing

**Files:**
- Create: `admin/src/pages/reports/InventoryTab.jsx`
- Modify: `admin/src/pages/reports/ReportsPage.jsx`, `tests/e2e/admin-insights.mjs`

Requirements (sheet 5.5): threshold inputs (oil ML default 100, bottles default 20, `min=1`; blank falls back to defaults) with a "تحديث" button; four capital cards; two low-stock lists (oils ML, bottles قطعة) with the empty message "✅ لا توجد تنبيهات"; tables for oils (quantity with a stock bar, cost per ml, value, status badge with Arabic labels for available/out of stock/discontinued), bottles, and alcohol; CSV exports `oils-inventory.csv` (`Name,Quantity (ML),Cost/ML,Value,Status`) and `bottles-inventory.csv` (`Name,Capacity,Quantity,Cost,Value`). Negative (owed) quantities display as negative numbers in a danger tone with an "مستحق" hint. Alcohol editing: an "تعديل" action opens an inline row editor on desktop and a dialog on phones with fields name, type, quantity, "إضافة" (add_quantity, > 0, step any) and cost; Save sends `PUT /api/alcohols/:id` with `{name,type,cost}` plus `quantity` only when changed plus `add_quantity` only when > 0; validation ("يرجى تعبئة جميع الحقول بشكل صحيح") inline; the server message is shown on error; on success refetch. The stock bar uses `pct = max(4, min(100, quantity))` and has a text alternative. Hostile alcohol names (containing `"` and `<`) must prefill the inputs literally and save back unchanged.

- [ ] **Step 1: Write the e2e scenarios first**: seed oils (one low, one negative), bottles, one alcohol with a hostile name containing `"><img src=x onerror=window.__xss=1>`; assert capital cards equal `GET /api/reports/inventory`, low-stock lists, negative quantity display, threshold change refetches (capture URL), CSV contents, open the alcohol editor, add quantity 10 and assert the DB value increased by exactly 10 and the name is unchanged, the "add_quantity 0" validation, `assertPageIsXssSafe`, `?tab=inventory` opens this tab, 375px layout. See them fail.
- [ ] **Step 2: Implement**; run `E2E_ONLY="Reports" npm run test:e2e`; verify build; commit "feat(admin): inventory report tab with alcohol editing".

---

### Task 9: Nav wiring, phase verification and hygiene

**Files:**
- Modify: `admin/src/app/nav.js` (all Phase 3 entries are `to:` routes: orders, interests, dashboard, reports), `admin/src/app/Shell.jsx` (mobile tab set: POS, Orders, Reports, Products (still legacy), More; the top-bar orders chip links to `/orders?filter=unconfirmed` with a router `Link`), `tests/e2e/admin-pos.mjs` if a selector changed

Requirements: the pending-orders chip and tab badge now use in-app navigation; the default landing page stays `/pos`; the mobile tab bar highlights the active route; no legacy link remains for Phase 3 pages inside the new shell (legacy pages themselves are untouched). The `ORDERS_URL` module-load lookup in Shell (a deferred minor) is removed by using the route.

- [ ] **Step 1: Update nav/shell** and the e2e selectors that depended on legacy links; run the affected scenarios with `E2E_ONLY`.
- [ ] **Step 2: Full verification**: `npm test`, `npm run test:admin`, `npm run build:admin`, then the full `npm run test:e2e` (about 15 minutes; one known unrelated flake, "Header: hides on scroll down", may need a rerun); RTL grep over `admin/src` (allowed leftovers only inside `components/ui`); commit "feat(admin): switch phase 3 pages to in-app routes".

---

## Self-Review

**Spec coverage (spec section 7 and Phase 3):** dashboard KPIs/charts/scrollable presets → Tasks 5-6; reports four tabs, filters in a sheet/collapsible on mobile, DataTable-like responsive tables with card fallback, inline stock editing and CSV kept → Tasks 6-8; orders with status filter, search, cards on mobile, order details with confirm action → Tasks 2-3; interest requests with WhatsApp links → Task 4; navigation/badge integration → Task 9; tests at 375px and XSS ports → per task.

**Placeholder scan:** no TBD; deliberate omission of verbatim JSX is recorded in the plan style note and the ledger.

**Consistency:** helper names (`money, num, pct, fmtDate, fmtDateShort, toDateInputValue, arabicStatus, paymentLabel, waLink, STATUSES, CHART_COLORS`), component names and the `?tab=` convention are defined in Task 1 or Task 6 and used the same way later; e2e hook ids are those of the contract sheet.

**Review Focus coverage:** unconfirmed rules → Tasks 2/3 e2e; confirm flow → Task 3; null-safe numbers → Tasks 5-8; CSV guard → Task 6 unit tests; date presets → Task 6 unit tests; hostile strings → every page e2e; server failure states → Task 5 e2e and each page's error state.
