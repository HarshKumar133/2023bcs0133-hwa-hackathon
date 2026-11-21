import { escapeAttr, escapeHtml } from '../security.js';

function lookupSummary(errors) {
  const keys = Object.keys(errors || {});
  if (!keys.length) return '';
  return `
    <div class="error-summary" id="lookup-errors" role="alert" tabindex="-1">
      <div class="error-summary-mark" aria-hidden="true">!</div>
      <div>
        <h2>We couldn't open that receipt</h2>
        <ul>
          ${keys.map((key) => `<li><a href="#lookup-${escapeAttr(key)}">${escapeHtml(errors[key])}</a></li>`).join('')}
        </ul>
      </div>
    </div>
  `;
}

export function renderLookup({ csrfToken, values = {}, errors = {}, notice = '' }) {
  const body = `
    <main id="main" class="lookup-page shell">
      <div class="lookup-intro">
        <p class="eyebrow">Receipt lookup</p>
        <h1>Find the receipt<br><em>without the link.</em></h1>
        <p class="section-lead">Use the order reference from your confirmation and the email you entered at checkout. We'll check that they belong together before opening the receipt.</p>
        <div class="lookup-illustration" aria-hidden="true">
          <svg viewBox="0 0 320 180">
            <rect x="48" y="18" width="224" height="144" rx="8" fill="none" stroke="currentColor" stroke-width="1.4"/>
            <path d="M48 58h224" stroke="currentColor" stroke-width="1.2" opacity="0.4"/>
            <circle cx="66" cy="38" r="4" fill="currentColor" opacity="0.4"/>
            <circle cx="80" cy="38" r="4" fill="currentColor" opacity="0.25"/>
            <circle cx="94" cy="38" r="4" fill="currentColor" opacity="0.15"/>
            <path d="M76 88h104M76 108h72M76 128h88" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" opacity="0.55"/>
            <circle cx="232" cy="112" r="26" fill="none" stroke="currentColor" stroke-width="1.4"/>
            <path d="M251 131l18 18" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
            <path d="M224 112l6 6 11-13" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
        </div>
      </div>

      <div class="lookup-card">
        <div class="checkout-head">
          <div>
            <p class="eyebrow">Order details</p>
            <h2>Open your receipt</h2>
          </div>
          <span class="checkout-step">Private</span>
        </div>

        ${notice ? `<div class="notice notice--warn" role="status">${escapeHtml(notice)}</div>` : ''}
        ${lookupSummary(errors)}

        <form class="lookup-form" method="post" action="/receipt/lookup" novalidate data-lookup-form>
          <input type="hidden" name="csrf" value="${escapeAttr(csrfToken)}">
          <div class="field${errors.orderRef ? ' field--error' : ''}">
            <label for="lookup-orderRef">Order reference<span class="req" aria-hidden="true">*</span></label>
            <p class="field-help" id="lookup-orderRef-help">It looks like TT-7K4M9P2Q and appears at the top of the receipt.</p>
            <input
              id="lookup-orderRef"
              name="orderRef"
              type="text"
              value="${escapeAttr(values.orderRef || '')}"
              placeholder="TT-7K4M9P2Q"
              autocomplete="off"
              autocapitalize="characters"
              spellcheck="false"
              maxlength="24"
              required
              ${errors.orderRef ? 'aria-invalid="true" aria-describedby="lookup-orderRef-help lookup-orderRef-error"' : 'aria-describedby="lookup-orderRef-help"'}
            >
            ${errors.orderRef ? `<p class="field-error" id="lookup-orderRef-error">${escapeHtml(errors.orderRef)}</p>` : ''}
          </div>
          <div class="field${errors.email ? ' field--error' : ''}">
            <label for="lookup-email">Email used for the order<span class="req" aria-hidden="true">*</span></label>
            <input
              id="lookup-email"
              name="email"
              type="email"
              value="${escapeAttr(values.email || '')}"
              placeholder="asha@example.com"
              autocomplete="email"
              spellcheck="false"
              maxlength="254"
              required
              ${errors.email ? 'aria-invalid="true" aria-describedby="lookup-email-error"' : ''}
            >
            ${errors.email ? `<p class="field-error" id="lookup-email-error">${escapeHtml(errors.email)}</p>` : ''}
          </div>
          <button type="submit" class="button button--ink button--large button--full">Open receipt <span aria-hidden="true">→</span></button>
          <p class="checkout-fine">For privacy, the form gives the same response whether the reference is unknown or the email doesn't match. Access is rate limited.</p>
        </form>

        <p class="checkout-lookup">No order yet? <a href="/#buy">Buy TrailTurn <span aria-hidden="true">→</span></a></p>
      </div>
    </main>
  `;

  return body;
}
