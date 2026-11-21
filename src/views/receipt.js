import { PRODUCT, formatINR } from '../pricing.js';
import { escapeHtml } from '../security.js';
import { logoMark, page } from './layout.js';

function formatDate(iso) {
  try {
    return new Intl.DateTimeFormat('en-IN', {
      dateStyle: 'medium',
      timeStyle: 'short',
      timeZone: 'Asia/Kolkata',
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

export function renderReceipt({ order }) {
  const customer = order.customer || {};
  const addressLines = [
    customer.address1,
    customer.address2,
    [customer.city, customer.state].filter(Boolean).join(', '),
    customer.pin,
  ].filter(Boolean);

  const body = `
    <main id="main" class="receipt-page shell">
      <div class="receipt-top">
        <a class="back-link" href="/"><span aria-hidden="true">←</span> Back to TrailTurn</a>
        <span class="eyebrow">Authorized receipt</span>
      </div>

      <article class="receipt" aria-labelledby="receipt-title">
        <header class="receipt-header">
          <a class="brand" href="/" aria-label="TrailTurn home">
            ${logoMark()}
            <span class="brand-word">TrailTurn</span>
          </a>
          <span class="receipt-status"><span class="status-dot" aria-hidden="true"></span>Reserved · demo</span>
        </header>

        <div class="receipt-title-row">
          <div>
            <p class="eyebrow">Demo order receipt</p>
            <h1 id="receipt-title">${escapeHtml(order.publicId)}</h1>
          </div>
          <div class="receipt-stamp" aria-hidden="true">
            <svg viewBox="0 0 120 120">
              <circle cx="60" cy="60" r="54" fill="none" stroke="currentColor" stroke-width="1.5"/>
              <circle cx="60" cy="60" r="45" fill="none" stroke="currentColor" stroke-width="1" stroke-dasharray="2 5"/>
              <path d="M60 30 L82 74 L38 74" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" stroke-dasharray="4 5"/>
              <circle cx="60" cy="30" r="5" fill="currentColor"/>
              <circle cx="82" cy="74" r="5" fill="none" stroke="currentColor" stroke-width="1.6"/>
              <circle cx="38" cy="74" r="5" fill="none" stroke="currentColor" stroke-width="1.6"/>
            </svg>
          </div>
        </div>

        <dl class="receipt-meta">
          <div><dt>Placed</dt><dd>${escapeHtml(formatDate(order.createdAt))}</dd></div>
          <div><dt>Status</dt><dd>Reserved for demo</dd></div>
          <div><dt>Quantity</dt><dd>${escapeHtml(order.quantity)}</dd></div>
        </dl>

        <div class="receipt-rule" aria-hidden="true"></div>

        <div class="receipt-item">
          <img src="/assets/toy-top.svg" alt="" width="112" height="112">
          <div class="receipt-item-copy">
            <h2>TrailTurn</h2>
            <p>Route card set included · ${escapeHtml(PRODUCT.sku)}</p>
            <p class="receipt-item-note">One route held · four timed chances</p>
          </div>
          <span class="receipt-item-price">${formatINR(order.unitPricePaise)}</span>
        </div>

        <dl class="receipt-totals">
          <div><dt>Subtotal (${escapeHtml(order.quantity)} × ${formatINR(order.unitPricePaise)})</dt><dd>${formatINR(order.subtotalPaise)}</dd></div>
          <div><dt>Delivery</dt><dd>${formatINR(order.deliveryPaise)}</dd></div>
          <div class="receipt-total"><dt>Total</dt><dd>${formatINR(order.totalPaise)}</dd></div>
        </dl>

        <div class="receipt-columns">
          <section class="receipt-address" aria-labelledby="receipt-address-title">
            <p class="eyebrow" id="receipt-address-title">Delivery to</p>
            <address>
              <strong>${escapeHtml(customer.fullName || '')}</strong>
              ${addressLines.map((line) => `<span>${escapeHtml(line)}</span>`).join('')}
            </address>
            <p class="receipt-contact">${escapeHtml(customer.email || '')}<br>+91 ${escapeHtml(customer.phone || '')}</p>
          </section>
          <section class="receipt-note" aria-labelledby="receipt-note-title">
            <p class="eyebrow" id="receipt-note-title">The honest bit</p>
            <p>This is a demo receipt. No payment was collected and no product will ship. The price, delivery fee, and five-unit limit are proposed demo decisions.</p>
          </section>
        </div>

        <footer class="receipt-actions">
          <button type="button" class="button button--ink" data-print>Print receipt</button>
          <a class="button button--outline" href="/receipt">Find another receipt</a>
          <a class="button button--text" href="/">Back to shop <span aria-hidden="true">→</span></a>
        </footer>
      </article>

      <p class="receipt-help">This receipt is scoped to one order. Keep the reference and the email used at checkout to find it again.</p>
    </main>
  `;

  return page({
    title: `Receipt ${order.publicId} · TrailTurn`,
    description: `Demo receipt for TrailTurn order ${order.publicId}.`,
    body,
    bodyClass: 'page-receipt',
    noindex: true,
  });
}

export function renderReceiptLocked() {
  const body = `
    <main id="main" class="simple-page shell">
      <p class="eyebrow">Private receipt</p>
      <h1>That receipt needs its key.</h1>
      <p class="section-lead">Receipt links are scoped to one order. Open the original link, or find it with your order reference and the email used at checkout.</p>
      <div class="simple-actions">
        <a class="button button--ink" href="/receipt">Find your receipt</a>
        <a class="button button--outline" href="/">Back to TrailTurn</a>
      </div>
    </main>
  `;
  return page({
    title: 'Receipt not found · TrailTurn',
    description: 'This receipt link is not authorized. Find a TrailTurn demo receipt with your order reference.',
    body,
    bodyClass: 'page-simple',
    noindex: true,
  });
}
