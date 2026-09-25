# Inventory / Auto Out-of-Stock Engine — Design Spec

Status: SUPERSEDED by 2026-09-25-order-stock-engine-design.md (user changed the business rule: orders are never blocked; stock is deducted only on POS confirmation)
Scope: sub-project 1 of Phase 3 (ecommerce). Sub-projects 2 (ecommerce storefront)
and 3 (admin control of offers/codes/Hero Banner) are separate specs, built on
top of this one.

## Problem

The current system has no automated stock tracking. `oil.model.js` and
`bottle.model.js` hold quantities, but nothing reads or decrements them on the
server. Stock deduction happens **client-side only**, in `checkOut.js` /
`update_stocks.js`: the browser fetches the current quantity, computes a new
value, and PUTs it back. This is fine for a single admin at one POS terminal,
but breaks down once real customers can place orders concurrently over the
internet (Phase 3 ecommerce site) — two simultaneous orders can both pass a
stock check and oversell.

Additionally, `checkOut.js` requires the admin to manually pick which specific
bottle record (`product.bottle.bottle_id`) a cart line uses. An ecommerce
customer has no reason to know about specific bottle SKUs — the system must
resolve "this size needs a bottle of this capacity" on its own.

There is currently no way to mark a product, or one size/variant of a product,
as out of stock automatically. `product.model.js` has a manual `status` enum
(`available` / `out of stock` / `discontinued`) that only an admin sets.

## Goals

1. A size/variant is automatically unavailable when there isn't enough oil or
   enough bottle stock to fulfill at least 1 unit.
2. A product is automatically treated as out of stock (for display/ordering
   purposes) when **none** of its sizes are available.
3. When a requested quantity can't be fully met, the system reports the
   maximum quantity that *can* currently be ordered, instead of just failing.
4. Order placement is atomic and safe under concurrent requests — no
   overselling. This replaces the current client-driven read-then-write
   pattern for **both** the internal POS and the new ecommerce site (one
   shared order-creation path).
5. Bottle stock is pooled across all bottle records of matching capacity
   (e.g. all "30ml" bottles, regardless of design), and the *specific* bottle
   used per order line is chosen later by an admin in the POS screen, not by
   the customer or automatically at order time.

## Non-goals

- Ecommerce storefront UI/UX (separate spec).
- Offer codes / Hero Banner admin controls (separate spec).
- Changing how alcohol stock is tracked (single global record) — unaffected
  by this design beyond continuing to deduct it the same way, just
  server-side now.
- Historical/audit trail of stock changes beyond what `order` documents
  already capture.

## Data model changes

### `oil.model.js`
Add `low_stock_threshold: { type: Number, default: 0 }`.
An oil is considered to have "headroom" for a request only while
`oil_quantity - amount_needed >= low_stock_threshold` continues to hold.

### `bottle.model.js`
No threshold field — bottle availability is a direct count, not a buffered
threshold (per product decision). Add:
```js
reserved: { type: Number, default: 0 }
```
`capacity` (already present, Number) continues to be the join key against a
product size string via `parseFloat(size)` — the same parsing convention
`checkOut.js` already uses (e.g. `"30ml"` → `30`).

Multiple bottle records may share the same `capacity` (different physical
bottle designs of the same size). They are treated as one interchangeable
pool: summed for availability, and deducted from whichever record(s) have
stock when an admin assigns a specific bottle to an order line.

### `order.model.js`
Per line item, `bottle` becomes optional at creation time (no longer
`required: true` on `bottle_id`/`name`/`cost`), and gains:
```js
bottle_assigned: { type: Boolean, default: false }
```
An order line with `bottle_assigned: false` has had bottle stock **reserved**
(via the pooled `reserved` counter) but not yet deducted from a specific
bottle record.

### `product.model.js`
No schema change. Stock status per size and per product is computed at read
time (see below), not stored, so it can never go stale relative to
`oil_quantity`/`bottle.quantity` changes.

## Availability computation

A shared backend helper, used by both product-read endpoints and the order
transaction:

```
computeSizeAvailability(product, size) -> { available: boolean, maxQty: number }
```

- `oil_per_unit = (product.oil_percentage / 100) * parseFloat(size)`
- `oil_headroom = oil.oil_quantity - oil.low_stock_threshold`
- `max_by_oil = floor(oil_headroom / oil_per_unit)` (0 if negative)
- `bottle_pool = sum(quantity - reserved)` across all bottles where
  `capacity === parseFloat(size)`
- `maxQty = min(max_by_oil, bottle_pool)`, floored at 0
- `available = maxQty > 0`

Product-level computed `stock_status`:
- `"out of stock"` if every size in `size_list` has `available: false`
- otherwise `"available"`

This is returned alongside product data (not stored on the document) so
ecommerce listing/detail pages and the internal system always see live
numbers. The existing manual `product.status` field is untouched and keeps
its own meaning (e.g. `discontinued`); a product is only actually orderable
when `product.status === "available"` **and** the computed `stock_status`
for the requested size is available.

## Order placement flow (shared by POS and ecommerce)

Runs as a single MongoDB transaction, per order, iterating its line items:

1. For each line: recompute `oil_per_unit` and `bottle_pool` as above.
2. Determine `maxQty` for the requested size right now (same formula as
   `computeSizeAvailability`, evaluated inside the transaction against
   current data for consistency).
3. If `requested_qty > maxQty`:
   - If `maxQty === 0`: reject that line entirely.
   - Otherwise: the API responds with the cappable quantity (`maxQty`) for
     that line instead of silently completing the order, so the caller
     (ecommerce UI or POS) can show "only N available" and let the
     user/admin decide to adjust and resubmit. The order is not created in
     this response.
4. Once quantities are confirmed within limits, for each accepted line:
   - Atomically decrement `oil.oil_quantity` by `oil_per_unit * qty` using a
     guarded update (`oil_quantity - amount >= low_stock_threshold` in the
     query filter, not read-then-write).
   - Atomically increment `reserved` by `qty` on however many bottle records
     of matching capacity are needed to cover it, guarded by
     `quantity - reserved >= amount` in the query filter. `bottle_id` on the
     order line stays null; `bottle_assigned` stays false.
5. Commit the transaction and create the `order` document.

Alcohol continues to be decremented the same way (single global record, no
change to that logic beyond moving it server-side/atomic).

## Admin bottle assignment (POS screen)

A new endpoint, e.g. `PATCH /api/orders/:id/lines/:lineId/assign-bottle`,
admin-only:

- Input: `{ bottle_id }` (a specific bottle record of the matching capacity).
- Atomically: decrement that bottle's `quantity` by the line's `qty`,
  decrement the pooled `reserved` amount that was set aside for this line,
  set `bottle_id`, `bottle.name`, `bottle.cost`, and `bottle_assigned: true`
  on the order line.
- Reassignment ("mod the order"): if a line already has a bottle assigned and
  admin picks a different one, release the old bottle's `quantity` and
  `reserved` bookkeeping first, then apply the new assignment the same way.

## Cancellation / refund

If an order (or a line) is canceled:
- Oil (and alcohol) already deducted is added back to the corresponding
  record(s).
- If `bottle_assigned` is false: release the `reserved` amount back on the
  pooled bottle records for that capacity.
- If `bottle_assigned` is true: add the deducted `quantity` back to the
  specific bottle record that was assigned.

## Error handling

- Oil/bottle guarded updates use Mongo's atomic query-filter-plus-update
  pattern (`findOneAndUpdate` with the sufficiency check in the filter, or
  transaction-scoped equivalents) so two concurrent requests can never both
  succeed against the same remaining stock — one will fail the filter and
  retry/reject.
- Validation errors (missing product, size not found in `size_list`, etc.)
  return 400/404 as the existing controllers already do.
- All stock mutations happen inside the same transaction as order creation;
  a failure at any step rolls back the whole order (no partial deduction).

## Testing

- Unit tests for `computeSizeAvailability` covering: sufficient stock,
  oil-limited, bottle-limited, pooled multi-bottle capacity, threshold
  boundary (`oil_quantity === low_stock_threshold`).
- Integration tests for the order-placement transaction: concurrent order
  requests against limited stock (verifying no oversell), capped-quantity
  response shape, and rollback on partial failure.
- Integration tests for bottle assignment and reassignment, and for
  cancellation refund paths (oil-only reserved case vs. already-assigned
  case).
