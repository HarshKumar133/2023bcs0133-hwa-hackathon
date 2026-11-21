import { sectionLabel } from './layout.js';
import { PRODUCT } from '../pricing.js';
import { formatINR } from './money.js';

const references = [
  {
    title: 'Product context and prior art',
    items: [
      ['CleverPet — product description', 'https://cleverpet.com/'],
      ['CleverPet / hackerpet — public touchpad examples', 'https://github.com/CleverPet/hackerpet'],
      ['Nicky Case — The Evolution of Trust', 'https://ncase.me/trust/'],
      ['LOW←TECH Magazine — design approach', 'https://solar.lowtechmagazine.com/'],
      ['Shopify Dawn — product gallery', 'https://github.com/Shopify/dawn'],
    ],
  },
  {
    title: 'Checkout, forms, and accessibility',
    items: [
      ['Baymard — guest checkout research', 'https://baymard.com/blog/guest-checkout'],
      ['GOV.UK Design System — error summary', 'https://design-system.service.gov.uk/components/error-summary/'],
      ['WAI-ARIA Authoring Practices', 'https://www.w3.org/WAI/ARIA/apg/'],
      ['WCAG 2.2', 'https://www.w3.org/TR/WCAG22/'],
      ['axe-core accessibility tests', 'https://github.com/dequelabs/axe-core'],
    ],
  },
  {
    title: 'State, transactions, and retries',
    items: [
      ['Stately XState — state machines', 'https://github.com/statelyai/xstate'],
      ['Medusa — cart completion workflow', 'https://github.com/medusajs/medusa/blob/develop/packages/core/core-flows/src/cart/workflows/complete-cart.ts'],
      ['node-postgres — transactions', 'https://node-postgres.com/features/transactions'],
      ['MDN — If-Match', 'https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/If-Match'],
      ['MDN — storage event', 'https://developer.mozilla.org/en-US/docs/Web/API/Window/storage_event'],
      ['MDN — currency formatting with Intl.NumberFormat', 'https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Intl/NumberFormat'],
    ],
  },
  {
    title: 'Security and authorization',
    items: [
      ['OWASP — input validation', 'https://cheatsheetseries.owasp.org/cheatsheets/Input_Validation_Cheat_Sheet.html'],
      ['OWASP — business logic security', 'https://cheatsheetseries.owasp.org/cheatsheets/Business_Logic_Security_Cheat_Sheet.html'],
      ['OWASP — SQL injection prevention', 'https://cheatsheetseries.owasp.org/cheatsheets/SQL_Injection_Prevention_Cheat_Sheet.html'],
      ['OWASP — XSS prevention', 'https://cheatsheetseries.owasp.org/cheatsheets/Cross_Site_Scripting_Prevention_Cheat_Sheet.html'],
      ['OWASP — authorization', 'https://cheatsheetseries.owasp.org/cheatsheets/Authorization_Cheat_Sheet.html'],
      ['OWASP — CSRF prevention', 'https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html'],
      ['OWASP — REST security', 'https://cheatsheetseries.owasp.org/cheatsheets/REST_Security_Cheat_Sheet.html'],
    ],
  },
  {
    title: 'Testing, performance, and release',
    items: [
      ['Playwright — testing practices', 'https://playwright.dev/docs/best-practices'],
      ['Google — web-vitals', 'https://github.com/GoogleChrome/web-vitals'],
      ['Google — Core Web Vitals thresholds', 'https://web.dev/articles/vitals'],
      ['Twelve-Factor — dev/prod parity', 'https://12factor.net/dev-prod-parity'],
      ['Pro Git — basic branching and merging', 'https://git-scm.com/book/en/v2/Git-Branching-Basic-Branching-and-Merging'],
    ],
  },
];

export function renderNotes() {
  const body = `
    <main id="main" class="notes-page shell">
      <header class="notes-hero">
        <p class="eyebrow">Demo &amp; research notes</p>
        <h1>What this shop is.<br><em>And what it isn't.</em></h1>
        <p class="section-lead">TrailTurn is a product concept and a working web demo. The shop is real enough to place a guest order and reload a private receipt. It is not a live store, a charging checkout, or a tested physical product.</p>
      </header>

      <section class="notes-section">
        ${sectionLabel('01', 'The product finding')}
        <div class="notes-split">
          <h2>A sequence already exists. The route is the proposal.</h2>
          <div>
            <p>CleverPet publicly describes dogs touching pads in a sequence to earn kibble, and its hackerpet repository includes touchpad game examples. Claiming the sequence itself as the invention would undermine the entry.</p>
            <p>TrailTurn's proposed improvement is a route the dog can feel and resume. A drum holds the current paddle physically raised between interactions. Walking away after step one leaves the next paddle raised. Returning resumes the same route. A route diagram on the drum is visible to the owner during setup, and a missed time slot cannot release a pile of portions.</p>
            <p class="notes-caution">This comparison does not establish worldwide novelty. Whether dogs discover the cue and re-engage is a prototype question.</p>
          </div>
        </div>
      </section>

      <section class="notes-section">
        ${sectionLabel('02', 'Demo assumptions')}
        <div class="assumption-grid">
          <article><h3>Product</h3><p>A floor toy with three paddles, a printed route diagram, four timed opportunities at minutes 0, 15, 30, and 45, and a held current step.</p></article>
          <article><h3>Commerce</h3><p>${formatINR(PRODUCT.unitPricePaise)} unit price, ${formatINR(PRODUCT.deliveryPaise)} delivery, ${PRODUCT.maxQuantity}-unit limit, Indian delivery fields, guest checkout, and a non-charging order flow.</p></article>
          <article><h3>Routes</h3><p>Long way: 1 → 2 → 3. Switchback: 1 → 3 → 2. Route names and the missed-round policy are demo decisions.</p></article>
          <article><h3>Not validated</h3><p>Actual use time, dog re-engagement, mechanical reliability, portion handling, and suitability for unsupervised use need physical validation.</p></article>
        </div>
      </section>

      <section class="notes-section">
        ${sectionLabel('03', 'Engineering decisions')}
        <div class="engineering-list">
          <div><span>01</span><h3>One source for pricing</h3><p>The server owns unit price, delivery, quantity limit, and totals. The browser renders the same values but never submits a trusted total.</p></div>
          <div><span>02</span><h3>An explicit demo state machine</h3><p>Ready, playing, paused, closed, and complete. The paddle up, missed slots, and route progress are derived from that state instead of scattered DOM flags.</p></div>
          <div><span>03</span><h3>Transactional order placement</h3><p>The cart revision is checked inside a SQLite transaction. The cart is completed and the order inserted together, so a partial write cannot leave both states active.</p></div>
          <div><span>04</span><h3>Idempotent retries</h3><p>A guest-scoped idempotency key and a unique cart-to-order rule let a retry find the existing order after a lost response.</p></div>
          <div><span>05</span><h3>Authorized receipts</h3><p>Receipt links carry an HMAC-signed token. The receipt cookie is path-scoped to the order. Lookup requires the public reference and the matching email, with rate limiting and a generic failure.</p></div>
          <div><span>06</span><h3>Accessible interaction</h3><p>Semantic buttons, visible focus, an aria-live demo status, an error summary that receives focus, labelled fields, and reduced-motion support.</p></div>
        </div>
      </section>

      <section class="notes-section">
        ${sectionLabel('04', 'References')}
        <p class="notes-lede">These public references informed the design and engineering decisions. They are documentation links, not bundled code or assets. All HTML, CSS, SVG, and server code in this repository were written for this demo.</p>
        <div class="reference-groups">
          ${references.map((group) => `
            <article class="reference-group">
              <h3>${group.title}</h3>
              <ul>
                ${group.items.map(([label, href]) => `<li><a href="${href}" rel="noreferrer noopener" target="_blank">${label} <span aria-hidden="true">↗</span></a></li>`).join('')}
              </ul>
            </article>
          `).join('')}
        </div>
      </section>

      <section class="notes-section notes-section--end">
        <div class="notes-end">
          <p class="eyebrow">A note on the numbers</p>
          <p>This build can be checked for behavior, accessibility, and local performance. It cannot establish a real-user Core Web Vitals percentile for a new shop. Checkout should be repeated on the intended host, because the deployed database, environment, and cookies can differ from this local run.</p>
          <a class="button button--ink" href="/">Back to the shop <span aria-hidden="true">→</span></a>
        </div>
      </section>
    </main>
  `;

  return body;
}
