import { PRODUCT } from '../pricing.js';
import { formatINR } from './money.js';
import { escapeAttr, escapeHtml } from '../security.js';

export function logoMark(className = 'brand-mark') {
  return `
    <span class="${escapeAttr(className)}" aria-hidden="true">
      <svg viewBox="0 0 44 44" role="presentation" focusable="false">
        <circle cx="22" cy="22" r="20" fill="#294C3C" stroke="#20251F" stroke-width="1.4"/>
        <ellipse cx="22" cy="22" rx="15" ry="10" fill="none" stroke="#F5F0E5" stroke-width="0.9" opacity="0.38"/>
        <rect x="17.5" y="8" width="9" height="7.5" rx="3.6" fill="#F5F0E5" stroke="#20251F" stroke-width="1"/>
        <rect x="8.5" y="23" width="9" height="7" rx="3.4" fill="#F5F0E5" stroke="#20251F" stroke-width="1" transform="rotate(-34 13 26.5)"/>
        <rect x="26.5" y="23" width="9" height="7" rx="3.4" fill="#F5F0E5" stroke="#20251F" stroke-width="1" transform="rotate(34 31 26.5)"/>
        <path d="M17 32.5c0 4.6 10 4.6 10 0" fill="#F5F0E5" stroke="#20251F" stroke-width="1.1"/>
        <ellipse cx="22" cy="32.5" rx="5" ry="1.8" fill="#B93827" stroke="#20251F" stroke-width="0.8"/>
      </svg>
    </span>
  `;
}

export function siteHeader({ cartQuantity = 0, current = '' } = {}) {
  return `
    <a class="skip-link" href="#main">Skip to content</a>
    <div class="announcement">
      <div class="shell announcement-inner">
        <p>Concept shop <span class="dot" aria-hidden="true">·</span> demo checkout, no payment collected <span class="dot" aria-hidden="true">·</span> ${formatINR(PRODUCT.deliveryPaise)} delivery across India</p>
        <a href="/#demo">Try the toy first <span aria-hidden="true">↘</span></a>
      </div>
    </div>
    <header class="site-header" data-header>
      <div class="shell header-inner">
        <a class="brand" href="/" aria-label="TrailTurn home">
          ${logoMark()}
          <span class="brand-word">TrailTurn</span>
        </a>
        <nav class="site-nav" aria-label="Primary">
          <a href="/#toy"${current === 'toy' ? ' aria-current="page"' : ''}>The toy</a>
          <a href="/#how">How it works</a>
          <a href="/#demo">Try a route</a>
          <a href="/#buy">Buy</a>
        </nav>
        <div class="header-actions">
          <span class="header-price">${formatINR(PRODUCT.unitPricePaise)}</span>
          <a class="button button--small button--tomato" href="/#buy">
            <span>Buy</span>
            <span class="button-count" data-header-qty>${escapeHtml(cartQuantity)}</span>
          </a>
        </div>
      </div>
    </header>
  `;
}

export function siteFooter() {
  return `
    <footer class="site-footer">
      <div class="shell footer-grid">
        <div class="footer-brand">
          <a class="brand brand--footer" href="/" aria-label="TrailTurn home">
            ${logoMark()}
            <span class="brand-word">TrailTurn</span>
          </a>
          <p class="footer-tagline">A route your dog can feel.<br>And return to.</p>
          <p class="footer-small">A product concept, built as a working shop demo.</p>
        </div>
        <div class="footer-col">
          <h2>Explore</h2>
          <a href="/#toy">The toy</a>
          <a href="/#how">How it works</a>
          <a href="/#demo">Try a route</a>
          <a href="/#buy">Buy TrailTurn</a>
        </div>
        <div class="footer-col">
          <h2>Your order</h2>
          <a href="/receipt">Find a receipt</a>
          <a href="/notes">Demo &amp; research notes</a>
          <a href="/healthz">Service health</a>
        </div>
        <div class="footer-note">
          <p class="eyebrow">The honest bit</p>
          <p>This is a concept shop. No payment is collected and no product ships. Price, delivery, the ${PRODUCT.maxQuantity}-unit limit, route names, and the missed-round policy are demo decisions. Physical use, dog re-engagement, mechanical reliability, and unsupervised safety still need testing.</p>
        </div>
      </div>
      <div class="shell footer-bottom">
        <p>© ${new Date().getFullYear()} TrailTurn concept. Made for a calmer kind of play.</p>
        <p>Prices in INR <span class="dot" aria-hidden="true">·</span> Inclusive of all taxes</p>
      </div>
    </footer>
  `;
}

export function page({
  title,
  description,
  body,
  bodyClass = '',
  bodyData = '',
  noindex = false,
  header = true,
  footer = true,
  cartQuantity = 0,
  current = '',
}) {
  return `<!doctype html>
<html lang="en-IN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(title)}</title>
  <meta name="description" content="${escapeAttr(description)}">
  <meta name="theme-color" content="#f5f0e5">
  <meta name="color-scheme" content="light">
  ${noindex ? '<meta name="robots" content="noindex, nofollow">' : ''}
  <link rel="icon" href="/favicon.svg" type="image/svg+xml">
  <link rel="preload" href="/fonts/fraunces-normal-latin.woff2" as="font" type="font/woff2" crossorigin>
  <link rel="preload" href="/fonts/instrument-sans-latin.woff2" as="font" type="font/woff2" crossorigin>
  <link rel="stylesheet" href="/styles.css">
</head>
<body class="${escapeAttr(bodyClass)}"${bodyData ? ` ${bodyData}` : ''}>
  ${header ? siteHeader({ cartQuantity, current }) : ''}
  ${body}
  ${footer ? siteFooter() : ''}
  <script src="/app.js" defer></script>
</body>
</html>`;
}

export function buttonLink({ href, label, variant = 'ink', className = '', attrs = '' }) {
  return `<a class="button button--${escapeAttr(variant)}${className ? ` ${escapeAttr(className)}` : ''}" href="${escapeAttr(href)}"${attrs ? ` ${attrs}` : ''}>${label}</a>`;
}

export function sectionLabel(number, text) {
  return `<p class="section-label"><span class="section-number">${escapeHtml(number)}</span><span class="section-rule" aria-hidden="true"></span><span>${escapeHtml(text)}</span></p>`;
}
