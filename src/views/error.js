import { escapeHtml } from '../security.js';
import { page } from './layout.js';

export function renderErrorPage({ status = 404, title = 'Page not found', message = 'That page is not here.' }) {
  const body = `
    <main id="main" class="simple-page shell">
      <p class="eyebrow">Error ${escapeHtml(status)}</p>
      <h1>${escapeHtml(title)}</h1>
      <p class="section-lead">${escapeHtml(message)}</p>
      <div class="simple-actions">
        <a class="button button--ink" href="/">Back to TrailTurn</a>
        <a class="button button--outline" href="/receipt">Find a receipt</a>
      </div>
      <div class="error-doodle" aria-hidden="true">
        <svg viewBox="0 0 320 160">
          <circle cx="160" cy="80" r="58" fill="none" stroke="currentColor" stroke-width="1.4"/>
          <path d="M160 22 L208 112 L112 112" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" stroke-dasharray="5 6"/>
          <circle cx="160" cy="22" r="7" fill="currentColor"/>
          <circle cx="208" cy="112" r="7" fill="none" stroke="currentColor" stroke-width="1.4"/>
          <circle cx="112" cy="112" r="7" fill="none" stroke="currentColor" stroke-width="1.4"/>
          <path d="M62 80h-28M258 80h28M160 142v10" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" opacity="0.35"/>
        </svg>
      </div>
    </main>
  `;
  return page({
    title: `${title} · TrailTurn`,
    description: message,
    body,
    bodyClass: 'page-simple',
    noindex: true,
  });
}
