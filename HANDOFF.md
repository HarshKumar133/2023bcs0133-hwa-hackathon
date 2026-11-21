# 02 · One product, one stored guest order

**Decision:** keep one Node HTTP application, its existing guest cookies and one SQLite database. The public page is a projection of the cart; only the server can complete it. No starter framework router, ORM or session package existed to reuse. `POST /checkout` (HTML) and `POST /api/orders` (JSON) share the same commit operation.

## Follow one order through the repo

| Step | Owner | What crosses the boundary |
| --- | --- | --- |
| Display | [`src/pricing.js`](src/pricing.js) → [`src/views/home.js`](src/views/home.js) | `PRODUCT` owns the catalog entry, SKU, unit price, delivery and limit. `totalsFor` uses integer paise. `GET /` in `server.js` loads or creates a guest cart and renders the form. |
| Change quantity | `initCart` in [`public/app.js`](public/app.js) → `PUT /api/cart` → `updateCartQuantity` in [`src/db.js`](src/db.js) | The browser sends quantity and `If-Match`. The `tt_cart` cookie identifies the cart; SQLite owns quantity, revision and active/completed status. A stale revision returns the current cart for review. |
| Submit | `initCheckout` → [`server.js`](server.js) | Contact and delivery fields, cart ID, expected revision and an attempt key enter as **untrusted input**. The route checks origin, CSRF, cart ownership and request shape; [`src/validation.js`](src/validation.js) validates customer fields. The server scopes the attempt key to the guest using `guestKey`. Browser totals do not enter the commit. |
| Commit | `createStore().placeOrder()` in [`src/db.js`](src/db.js) | Inside `BEGIN IMMEDIATE`, resolve an existing attempt or check the active cart and revision, compute totals, insert the order snapshot and mark the cart completed. `COMMIT` makes both writes durable; errors roll them back. Unique cart and attempt keys prevent a second order. |
| Confirm | `orderResponse` and `GET /receipt/:publicId` in `server.js` → [`src/views/receipt.js`](src/views/receipt.js) | A stored order yields a signed receipt link. The server exchanges the key for an order-scoped cookie, then renders the saved amounts on the clean receipt URL. |

## 03 · Product and basket rules

`PRODUCT` in `src/pricing.js` defines the green floor toy, cream nose paddles, front reward cup, SKU `TT-DRUM-01`, INR, 149900-paise unit price, 4900-paise delivery per nonempty order and five-unit demo limit. `totalsFor(quantity)` is the pure quote used by cart reads and order commits. All amounts due are included. Quantities 0, 1, 2 and 5 total **₹0, ₹1,548, ₹3,047 and ₹7,544** respectively.

New baskets start empty. Zero is a valid saved cart revision but cannot create an order. Database schema version 1 admits zero in carts while retaining the positive quantity constraint on orders; existing receipt amounts remain snapshots. See [OWASP on deriving prices server-side](https://cheatsheetseries.owasp.org/cheatsheets/Business_Logic_Security_Cheat_Sheet.html) and [MDN on formatting currency](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Intl/NumberFormat). Rupee formatting is only used to display integer-paise amounts.

## Checkout transitions

`initCheckout` owns a local transition table. `data-checkout-phase`, button availability and busy state reflect it. The server-rendered form starts in `editing`, or `recoverable-failure` when redisplaying a rejected submission.

| From | Event | To |
| --- | --- | --- |
| Editing | Guest submits after any quantity update finishes | Submitting |
| Submitting | Server returns the stored order and receipt URL, including on recovery | Confirmed (terminal; open receipt) |
| Submitting | Validation, stale revision, rate limit, or an uncertain network response | Recoverable failure |
| Recoverable failure, known rejection | Edit fields / submit again after review | Editing / submitting |
| Recoverable failure, outcome unknown | Guest selects **Check previous order** | Submitting a read-only status check |
| Status check in flight | Saved order / no matching order yet / no reliable response | Confirmed / recoverable failure with editing enabled / recoverable failure with check available |

Before sending the write, the tab remembers only `{cartId, idempotencyKey}` in `sessionStorage`. On timeout, disconnect, unreadable success, or server error it keeps that identity, locks edits and offers a check rather than another write. `POST /api/orders/status` uses the same CSRF and guest-key boundary, reads SQLite and never creates a cart or order. A null result means *not found at check time*. A reviewed retry on the same cart retains the key; the transaction also enforces one order per cart. Recovery survives a reload of that tab with the same guest session. Without browser storage, same-page recovery still works.

`initDemo` in `public/app.js` owns **only the toy**. Start opens the window; a correct paddle advances the route; walking away pauses it; returning resumes; passing a slot moves the clock, not the paddle. The last slot closes the window or the last push completes the route. Reset or route selection starts a fresh demonstration. None of these events submits checkout or changes quantity.

## References and resume point

- [Stately XState](https://github.com/statelyai/xstate): model legal `(state, event)` transitions explicitly. Four flat checkout phases fit a local table.
- [Medusa’s complete-cart workflow](https://github.com/medusajs/medusa/blob/develop/packages/core/core-flows/src/cart/workflows/complete-cart.ts): resolve an existing order and complete a server-owned cart snapshot. Here, a single SQLite transaction provides the serialization and commit boundary.

A fresh session should start with `src/pricing.js` and `src/views/home.js` for displayed values, then read `initCheckout`, the three order entry points in `server.js` (JSON submit, HTML submit, status check), and `placeOrder`. [`tests/storefront.test.js`](tests/storefront.test.js) covers storage, retries, restart, receipt access and guest-scoped status. [`tests/browser-smoke.mjs`](tests/browser-smoke.mjs) drops a response **after commit**, reloads the tab and checks the same receipt. Run `npm test`; the [README](README.md#verification) has the isolated Chrome check.

## 04 · Durable guest carts and receipts

| Where | What is kept |
| --- | --- |
| Browser cookies | `tt_guest` is a random 256-bit HttpOnly session credential. `tt_cart` selects a cart; its ID alone does not authorize access to a v2 cart. `tt_csrf` protects writes. A signed, path-scoped cookie opens one receipt. |
| Browser tab | While checkout is unresolved, `sessionStorage` holds only the cart ID and random attempt key. Form fields do not go into browser storage. |
| SQLite `carts` | UUID, digest of the owning guest token, quantity, revision, active/completed status and timestamps. The order inherits its guest owner through the cart foreign key. |
| SQLite `orders` | Internal UUID, opaque unique public reference, unique completed cart and unique guest-scoped attempt digest. For this one-SKU shop, the immutable line lives on the order: name, SKU, currency, positive quantity, unit price and subtotal. Delivery and total are saved alongside it. All money columns ending in `_paise` are integer hundredths of a rupee. |
| Delivery data | Validated name, email, mobile number, address lines, city, state and PIN. Normalized email supports exact receipt lookup. No unused delivery notes, payment fields or guest profile on new orders. |

The [v2 migration](src/migrations/002-guest-order-snapshot.sql) adds columns and triggers to the version-1 tables. Historical metadata defaults describe the one product sold at the time; existing totals, customer payloads, references and attempt keys are preserved. New writes explicitly snapshot the current catalog. SQLite rejects updates to saved orders. Legacy orders have no recoverable guest digest; their original receipt/lookup and guest-scoped attempt paths remain valid. A returning holder of a legacy **active** cart cookie can bind it once on loading the shop. New cart inserts require an owner.

`openDatabase()` reads `PRAGMA user_version` under a write transaction. It advances the version only with the schema changes, rolls back on failure, and refuses newer schemas. Before updating an existing deployment, stop old writers and take an SQLite-consistent backup plus the receipt signing secret. Restore the backup with the previous application if a downgrade is required.

**Verification:** `node --test tests/storage.test.js` uses temporary database paths. It upgrades a seeded v1 store twice (the second open is a no-op), compares historical fields and checks immutability. A separate test places a two-unit guest order, closes the app, starts a fresh Node process with the same file and signing secret, and verifies the ₹3,047 receipt and attempt lookup over HTTP.

**Deployment decision:** local restart persistence does not prove that a host retains disk across redeploys. Use a persistent writable volume for SQLite and a stable signing secret, then repeat the restart/redeploy check on the target host. If only transient disk is available, supply durable backing storage behind `createStore()` before offering durable orders. Follow [Twelve-Factor deployment parity](https://12factor.net/dev-prod-parity) by testing against that same engine. The [node-postgres transaction guide](https://node-postgres.com/features/transactions) applies to a future `pg` adapter; this build uses `node:sqlite`, with all order writes on one SQLite connection.
