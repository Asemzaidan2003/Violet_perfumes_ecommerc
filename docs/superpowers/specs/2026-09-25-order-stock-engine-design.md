# Order & Stock Engine — Design Spec

Status: approved by user (2026-09-25), pending plan
Supersedes: `2026-09-22-inventory-stock-engine-design.md` (availability gating,
pooled bottle reservations and capped-quantity responses are dropped by user
decision).
Scope: sub-project 1 of Phase 3. The public storefront (sub-project 2) calls the
service defined here; its routes and pages are out of scope.

## Business rule (user decision)

Customers can always place an order, whether or not stock is available — it is
the shop's responsibility to make the product. Stock is deducted in exactly one
place: when an order is confirmed through the POS.

- **POS sale** (admin at the counter): created and confirmed in one step.
- **Online order** (storefront, later): created unconfirmed, no stock touched.
  The admin opens it in the POS, picks a bottle per line (may adjust quantity
  or price), and confirms → stock is deducted then.

## Problem with today's code

- Stock is deducted in the browser (`update_stocks.js`, read-then-write PUTs),
  and costs/prices are computed in the browser (`checkOut.js`). A public
  storefront cannot be trusted with either.
- Cancelling or deleting an order never returns stock.

## Data model

`order.model.js`, per line (`products[]`):
- `bottle.bottle_id` / `name` / `cost` become optional (online lines have no
  bottle until confirmation).
- New `oil_id` (String, the oil's custom `id`), `oil_ml`, `alcohol_ml`
  (Numbers): amounts the line needs.
- New `stock: { oil_ml, alcohol_ml, alcohol_id, oil_doc_id, bottles }`: amounts
  actually deducted at confirmation (can be less than needed when stock ran
  short), so a refund returns exactly what was taken. Refunds use
  `oil_doc_id` (the oil's stable `_id`), not the oil's custom `id`, so
  renaming an oil's custom `id` doesn't lose refunds.
- `cost_price`, `total_cost`, `total_profit` become `default: 0` (unknown until
  confirmation). Line profit is computed from the rounded line cost.

Order level:
- New `source: enum ["pos", "online"], default "pos"`.
- New `stock_deducted: Boolean, default true`. Existing (legacy) orders were
  deducted client-side at creation, so the default makes them read as
  confirmed with no data migration. New orders set it explicitly.

No changes to oil, bottle, alcohol or product models.

## Order service (`backend/services/order.service.js`)

Shared by the POS routes now and the storefront later. Every mutating function
runs in one MongoDB transaction (`mongoose.connection.transaction`), so an order
and its stock changes commit or roll back together; concurrent writers cause a
write conflict that the helper retries.

- `placeOrder(input, source)` → `{ order, shortages }`
  - `source` is required and must be exactly `"pos"` or `"online"`; there is
    no default. Input lines: `{ product_id, size, quantity, price?, bottle_id? }`.
  - Server prices every line from the product's `size_list` with
    `p_offer_percentage` applied. Only `source === "pos"` may override `price`.
    Client-sent cost/total fields are ignored. Online orders ignore any
    client-sent `bottle_id`; the bottle is only assigned when `source === "pos"`.
  - Needed amounts: `oil_ml = oil_percentage/100 × parseFloat(size) × qty`,
    same for alcohol.
  - `pos` → confirm immediately (below). `online` → saved with
    `stock_deducted: false`, costs and profit 0.
  - Limits: at most 50 lines per order (`MAX_LINES`), quantity must be a safe
    integer between 1 and 1000 (`MAX_QTY`), enforced on `placeOrder` lines and
    on `confirmOrder` quantity edits alike.
- `confirmOrder(id, lineEdits)` → `{ order, shortages }` — for unconfirmed
  orders; applies per-line `{ bottle_id, quantity?, price? }` then confirms.
- `changeStatus(id, status)` → order.
- `removeOrder(id)` → order.

**Confirmation (deduct + cost):** for each line, requires a bottle whose
`capacity === parseFloat(size)`; deducts oil (by custom `id`), the single
global alcohol record, and the chosen bottle. Stock floors at 0 — the sale is
never blocked; any gap is returned as
`shortages: [{ item, needed, available }]` so the POS can tell the admin what
to restock. Line cost = `oil_ml × oil_cost + alcohol_ml × alcohol.cost +
qty × bottle.cost`; totals are recomputed server-side.

**Status rules:**
- `completed`, `ready for delivery`, `in delivery`, `uncollected payment`
  require a confirmed order → 409 otherwise.
- Moving to `canceled` returns the deducted stock (`line.stock`) and marks the
  order unconfirmed. Legacy lines without `line.stock` return nothing (amounts
  unknown), status still changes.
- A canceled order cannot move to another status → 409.
- Deleting a non-canceled order returns its stock first.

Errors use the existing central handler: service throws `Error` with
`status` 4xx + `expose: true` (400 invalid input, 404 missing product/oil/
bottle/alcohol/order, 409 rule violations).

## API (admin, behind `requireAdmin`)

- `POST /api/orders` — POS sale: `{ products: [{product_id, size, quantity,
  price, bottle_id}], customer_id?, payment_method?, delivery_fee?,
  order_notes? }` → 201 `{ message, data, shortages }`.
- `POST /api/orders/:id/confirm` — `{ lines: [{ bottle_id, quantity?, price? }] }`
  (index-aligned with the order's lines) → 200 `{ message, data, shortages }`.
- `PUT /api/orders/:id` — `{ status }` with the rules above.
- `DELETE /api/orders/:id` — refunds as above.
- `GET` routes unchanged; `stock_deducted`/`source` appear in the JSON.

## Frontend

- `checkOut.js`: sends lines to `POST /api/orders`; shows the server's error
  message or a success alert listing shortages. `update_stocks.js` and
  `getStocks.js` are deleted.
- `order-details.html`: for unconfirmed, non-canceled orders shows per-line
  bottle select (bottles of matching capacity), quantity and price inputs, and
  a "confirm and deduct stock" button.
- `orders.html`: "unconfirmed" filter option and badge; status changes show the
  server's 409 message and revert the select.
- `index.html` (POS): a link showing the number of unconfirmed orders.

## Out of scope

Public order endpoint, storefront pages, customer accounts, payment,
availability display (storefront spec); stock history/audit; report changes
(reports already count only `completed` by default, which now requires
confirmation).

## Testing (`node:test`, local replica set)

- POS sale deducts oil/alcohol/bottle exactly and computes costs server-side;
  client-sent costs ignored; POS price override honoured.
- Shortage: sale succeeds, stock floors at 0, `shortages` reported; cancel
  returns only what was taken.
- Online order: no deduction; completing → 409; confirm with bottle → deducted;
  then completing → 200; confirming twice → 409.
- Cancel/delete refunds; canceled → pending → 409; legacy order cancel changes
  status only.
- Rollback: a bad second line (wrong-capacity bottle) leaves the first line's
  stock untouched.
- Concurrency: two simultaneous POS sales on the same oil both deduct (no lost
  update).
