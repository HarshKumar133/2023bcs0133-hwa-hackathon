# TrailTurn

A one-product concept shop for a floor toy that holds its next paddle up when a dog walks away. Try the two routes, place a non-charging guest order, and reopen its receipt. No account, payment provider, email delivery or shipment is involved.

## Run locally

Use Node.js 24 or later. No runtime dependencies or build step.

```sh
npm start
```

Open **http://127.0.0.1:3000**. `npm run dev` restarts the server when application code changes. Node may print an experimental SQLite warning. Copy `.env.example` to `.env` to override the defaults.

## Try it

1. Under **Try a route**, select **Switchback**, start the window and push paddle 1. Paddle 3 lifts. Walk away and let 15 minutes pass. No portion is used; returning enables paddle 3, followed by paddle 2. Long way uses **1 → 2 → 3** instead.
2. The demo accelerates the clock: a push consumes one opportunity, and **Let 15 min pass** skips one. There are at most four opportunities per window (0, 15, 30, 45). If the window closes before the third push, opening another window preserves the current paddle.
3. Under **Buy**, one unit is **₹2,948 delivered** (₹2,899 + ₹49). Change the quantity and compare a second shop tab. Delivery is charged once per order, up to five units.
4. Use fictional delivery details such as *Demo Guest*, `guest@example.test`, `9876543210`, *Unit 4, Demo Road, Pune, Maharashtra 411001*. Submit, reload the receipt, and try `/receipt` in a fresh browser session with the order reference and email. The bare receipt path is private without authorization.

## Verification

```sh
npm test
```

The built-in Node tests exercise HTTP requests against isolated databases: totals, invalid fields, stale edits, CSRF/origin rejection, duplicate submissions, lost-response retry, server restart, receipt access, lookup throttling, escaping, and ordinary HTML checkout.

`tests/browser-smoke.mjs` additionally checks desktop/tablet/mobile layouts, both routes, walking away, the final slot, gallery changes, cross-tab totals, form error focus, submission and receipt reload in Chrome. To run it without adding packages to the shop, use a disposable QA directory. Start a separate shop process with an isolated data directory first:

```sh
QA_DIR=$(mktemp -d)
export QA_DIR
DATA_DIR="$QA_DIR/data" PORT=3109 npm start
```

In another terminal, set `QA_DIR` to the same path:

```sh
npm install --prefix "$QA_DIR" playwright-core --no-save
cp tests/browser-smoke.mjs "$QA_DIR/check.mjs"
BASE_URL=http://127.0.0.1:3109 CHROME_PATH="/path/to/chrome" node "$QA_DIR/check.mjs"
```

On macOS, the typical `CHROME_PATH` is `/Applications/Google Chrome.app/Contents/MacOS/Google Chrome`. With `QA_DIR` exported, this also saves desktop and mobile screenshots.

## Implementation and deployment

| Location | Responsibility |
| --- | --- |
| `src/pricing.js` | SKU, integer-paise prices, quantity limit and totals |
| `public/app.js` | Paddle states, gallery, cart revisions and enhanced checkout |
| `src/views/` | Server-rendered shop, fallback forms, receipt and reference notes |
| `src/db.js` | Parameterized SQLite queries, transactions, unique order per cart |
| `src/security.js`, `server.js` | Request validation, guest-scoped retries, signed receipt links and cookies |
| `public/assets/`, `public/fonts/` | Original concept illustrations; locally served fonts with their OFL licenses |

Deploy as **one long-running Node process with a persistent writable volume**. Set `DATA_DIR` to that volume, `HOST=0.0.0.0` if required by the host, and `PORT` to the assigned port. `GET /healthz` checks database availability. A static-only host cannot run the checkout.

Keep `RECEIPT_SECRET` stable (at least 32 random characters), or persist the automatically generated `.receipt-secret` alongside `trailturn.db`. Preserve both when moving the shop. Back up SQLite with its online backup facility or stop the process before copying the whole data directory. Changing the secret invalidates existing signed links; reference-plus-email lookup can issue a new one. Serve through HTTPS; enable `TRUST_PROXY=1` only behind a trusted proxy that overwrites forwarded headers. Rate limits are in memory per process. Optional `/ops` exact-reference search requires `OPS_TOKEN`; it is disabled by default.

The `/notes` page links the design, prior art, checkout and engineering references. The gallery interaction draws on Dawn, and the annotated illustrations on LOW←TECH’s editorial approach. Product drawings and implementation are original; Fraunces and Instrument Sans are third-party fonts distributed separately under `public/fonts/`.

**Concept limits:** the price, delivery, timing, route cards, materials, dimensions and missed-slot policy are proposed. Dog engagement, portion handling, mechanical reliability and safety have not been physically validated. Local checks do not establish production performance or real-user Core Web Vitals.
