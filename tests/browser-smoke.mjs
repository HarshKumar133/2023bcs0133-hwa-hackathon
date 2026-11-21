// Optional browser check. See README for the external Playwright/Chrome setup.
import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';
import { join } from 'node:path';

const baseURL = process.env.BASE_URL || 'http://127.0.0.1:3000';
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH, headless: true });
try {
  const context = await browser.newContext({ baseURL, reducedMotion: 'reduce', viewport: { width: 1440, height: 940 } });
  const p = await context.newPage();
  const errors = [];
  p.on('pageerror', e => errors.push(e.message));
  await p.goto('/');
  await p.locator('h1').waitFor();
  await p.evaluate(() => document.fonts.ready);
  if (process.env.QA_DIR) await p.screenshot({ path: join(process.env.QA_DIR, 'desktop.png') });
  for (const width of [390, 768, 1024, 1440]) {
    await p.setViewportSize({ width, height: 940 });
    assert.ok(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    assert.ok((await p.locator('.hero-plate').boundingBox()).width > 250);
    if (width === 390 && process.env.QA_DIR) await p.screenshot({ path: join(process.env.QA_DIR, 'mobile.png') });
  }
  await p.getByRole('button', { name: 'The lift' }).click();
  assert.equal(await p.locator('[data-gallery-image]').getAttribute('src'), '/assets/toy-side.svg');
  const click = s => p.locator(`[data-${s}]`).click();
  const paddle = n => click(`paddle="${n}"`);
  const active = async n => assert.equal(await p.locator(`[data-paddle="${n}"]`).isEnabled(), true);
  for (const [route, second, third] of [['long', 2, 3], ['switch', 3, 2]]) {
    await p.locator(`button[data-route="${route}"]`).click();
    await click('demo-start'); await paddle(1); await click('demo-away'); await click('demo-skip');
    assert.equal(await p.locator('[data-demo-used]').textContent(), '1');
    assert.equal(await p.locator('.demo-paddle.is-active').getAttribute('data-paddle'), String(second));
    await click('demo-away'); await active(second); await paddle(second); await paddle(third);
    assert.equal(await p.locator('[data-demo]').getAttribute('data-phase'), 'complete');
  }
  await click('demo-reset'); await click('demo-start');
  for (let i = 0; i < 3; i++) await click('demo-skip');
  await paddle(1);
  assert.equal(await p.locator('[data-demo]').getAttribute('data-phase'), 'closed');
  await click('demo-start'); await active(3);
  await p.setViewportSize({ width: 390, height: 844 });
  const tab = await context.newPage();
  await tab.goto('/');
  await click('qty-increase');
  await p.waitForFunction(() => document.querySelector('[data-total]').textContent === '₹5,847');
  await tab.waitForFunction(() => document.querySelector('[data-qty-value]').textContent === '2');
  await tab.close();
  await click('checkout-submit');
  await p.locator('#checkout-errors').waitFor();
  assert.equal(await p.locator('#checkout-errors').evaluate(el => el === document.activeElement), true);
  for (const [name, value] of Object.entries({ fullName: 'Demo Guest', email: 'guest@example.test',
    address1: 'Unit 4, Demo Road', phone: '9876543210', city: 'Pune', pin: '411001' })) {
    await p.locator(`#field-${name}`).fill(value);
  }
  await p.locator('#field-state').selectOption('Maharashtra');
  await click('checkout-submit');
  await p.waitForURL(/\/receipt\/TT-[A-Z0-9]+$/);
  await p.reload();
  assert.equal(await p.locator('.receipt-total dd').textContent(), '₹5,847');
  assert.deepEqual(errors, []);
  console.log('Passed: responsive layout, gallery, both routes, held step, last slot, two tabs, checkout and receipt reload.');
} finally {
  await browser.close();
}
