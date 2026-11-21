import { formatINR } from '../pricing.js';
import { escapeAttr, escapeHtml } from '../security.js';
import { page } from './layout.js';

export function renderOps({ csrfToken, token = '', orderRef = '', result = null, error = '', searched = false }) {
  const body = `
    <main id="main" class="ops-page shell">
      <header class="notes-hero">
        <p class="eyebrow">Operator tool</p>
        <h1>Find a test order.</h1>
        <p class="section-lead">Search by public reference. This view deliberately omits names, addresses, emails, and receipt tokens.</p>
      </header>

      <div class="lookup-card">
        ${error ? `<div class="notice notice--warn" role="status">${escapeHtml(error)}</div>` : ''}
        <form class="lookup-form" method="post" action="/ops" novalidate>
          <input type="hidden" name="csrf" value="${escapeAttr(csrfToken)}">
          <div class="field">
            <label for="ops-token">Operator token</label>
            <input id="ops-token" name="token" type="password" value="${escapeAttr(token)}" autocomplete="off" required>
          </div>
          <div class="field">
            <label for="ops-ref">Order reference</label>
            <input id="ops-ref" name="orderRef" type="text" value="${escapeAttr(orderRef)}" placeholder="TT-7K4M9P2Q" maxlength="24" autocomplete="off" required>
          </div>
          <button class="button button--ink" type="submit">Search orders</button>
        </form>

        ${result ? `
          <div class="ops-result">
            <p class="eyebrow">Order found</p>
            <dl class="spec-list">
              <div><dt>Reference</dt><dd>${escapeHtml(result.publicId)}</dd></div>
              <div><dt>Status</dt><dd>${escapeHtml(result.status)}</dd></div>
              <div><dt>Placed</dt><dd>${escapeHtml(result.createdAt)}</dd></div>
              <div><dt>Quantity</dt><dd>${escapeHtml(result.quantity)}</dd></div>
              <div><dt>Total</dt><dd>${formatINR(result.totalPaise)}</dd></div>
              <div><dt>Cart</dt><dd><code>${escapeHtml(result.cartId)}</code></dd></div>
              <div><dt>Request key</dt><dd><code>${escapeHtml(result.idempotencyKey)}</code></dd></div>
            </dl>
          </div>
        ` : ''}

        ${searched && !result && !error ? '<p class="notice notice--warn" role="status">No order matches that reference.</p>' : ''}
      </div>
    </main>
  `;

  return page({
    title: 'Operator search · TrailTurn',
    description: 'Find a TrailTurn demo order by reference.',
    body,
    bodyClass: 'page-ops',
    noindex: true,
  });
}
