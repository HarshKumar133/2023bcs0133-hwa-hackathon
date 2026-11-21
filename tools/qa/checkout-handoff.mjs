'use strict';
// Local PDF relay for checkout QA.
// 1. Fetch the handoff PDF from the production server.
// 2. Serve it on 127.0.0.1:3999/handoff.pdf without exposing the URL.
// 3. Load /checkout in Chrome and capture the rendered result.
import { chromium } from 'playwright-core';

const checkout = process.env.CHECKOUT || 'http://127.0.0.1:3000/checkout';
const chrome = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

const relay = await import('node:http').then(async ({ createServer }) => {
  const server = createServer(async (request, response) => {
    if (request.url !== '/handoff.pdf') {
      response.writeHead(404).end();
      return;
    }
    try {
      const fetched = await fetch(process.env.PRIVATE_HANDOFF || 'http://127.0.0.1:3000/handoff.pdf');
      if (!fetched.ok) throw new Error(`handoff fetch failed: ${fetched.status}`);
      response.writeHead(200, {
        'Content-Type': fetched.headers.get('Content-Type') || 'application/pdf',
        'Cache-Control': 'no-store',
      });
      response.end(Buffer.from(await fetched.arrayBuffer()));
    } catch (error) {
      response.writeHead(502).end(String(error));
    }
  });
  await new Promise(resolve => server.listen(3999, '127.0.0.1', resolve));
  return server;
});
console.log('Relay listening on http://127.0.0.1:3999/handoff.pdf');

const browser = await chromium.launch({ executablePath: chrome, headless: false });
try {
  const page = await browser.newPage({ reducedMotion: 'reduce', viewport: { width: 1280, height: 860 } });
  const consoleErrors = [];
  const pageErrors = [];
  page.on('console', message => { if (message.type() === 'error') consoleErrors.push(message.text()); });
  page.on('pageerror', error => pageErrors.push(String(error)));
  await page.goto('http://127.0.0.1:3999/handoff.pdf', { waitUntil: 'domcontentloaded', timeout: 10_000 });
  await page.waitForResponse(response => response.url() === 'http://127.0.0.1:3999/handoff.pdf' && response.status() === 200, { timeout: 10_000 });
  await page.waitForTimeout(300);
  const pdfBytes = (await page.evaluate(async () => {
    const response = await fetch('/handoff.pdf');
    const buffer = await response.arrayBuffer();
    return response.ok ? buffer : null;
  }))?.byteLength;

  const checkoutPage = await browser.newPage();
  const result = await checkoutPage.goto(checkout, { waitUntil: 'domcontentloaded', timeout: 10_000 })
    .then(async response => ({
      status: response?.status() ?? null,
      title: await checkoutPage.title(),
      form: await checkoutPage.evaluate(() => {
        const form = document.querySelector('[data-checkout-form]');
        if (!form) return null;
        return {
          phase: form.dataset.checkoutPhase,
          submitLabel: document.querySelector('[data-checkout-submit-label]')?.textContent.trim() || null,
          total: document.querySelector('[data-total]')?.textContent.trim() || null,
          errors: Array.from(document.querySelectorAll('.field-error')).map(element => element.textContent.trim()).filter(Boolean),
        };
      }),
    }))
    .catch(error => ({ navigationError: String(error) }));

  console.log(JSON.stringify({ pdfBytes: pdfBytes ?? null, result, consoleErrors, pageErrors }, null, 2));
  await checkoutPage.screenshot({ path: '/tmp/trailturn-checkout-handoff.png' });
} finally {
  await browser.close();
  relay.close();
}
