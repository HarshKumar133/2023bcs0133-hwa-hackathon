'use strict';
// Direct browser navigation check: /cart -> /checkout -> Back.
import { chromium } from 'playwright-core';

const baseURL = process.env.BASE_URL || 'http://127.0.0.1:3000';
const chrome = process.env.CHROME_PATH;
if (!chrome) {
  console.error('CHROME_PATH is required');
  process.exit(2);
}

async function validateCartPage(page) {
  await page.waitForLoadState('networkidle', { timeout: 10_000 });
  const result = await page.evaluate(() => {
    const form = document.querySelector('[data-checkout-form]');
    if (!form) return { error: 'no checkout form' };
    const link = document.querySelector('a[href^="/"]');
    return {
      url: window.location.pathname,
      total: document.querySelector('[data-total]')?.textContent || null,
      qty: document.querySelector('[data-qty-value]')?.textContent || null,
      checkout: link?.href || null,
    };
  });
  if (!result.url.endsWith('/cart')) throw new Error(`expected /cart, got ${result.url}`);
  if (!result.total || !result.qty) throw new Error('cart text was not rendered');
  return result;
}

async function validateCheckoutPage(page) {
  await page.waitForLoadState('networkidle', { timeout: 10_000 });
  const result = await page.evaluate(() => {
    const form = document.querySelector('[data-checkout-form]');
    if (!form) return { error: 'no checkout form' };
    return {
      url: window.location.pathname,
      title: document.title,
      phase: form.dataset.checkoutPhase,
      submitLabel: document.querySelector('[data-checkout-submit-label]')?.textContent.trim() || null,
      total: document.querySelector('[data-total]')?.textContent.trim() || null,
      errors: Array.from(document.querySelectorAll('.field-error')).map(element => element.textContent.trim()).filter(Boolean),
    };
  });
  if (!result.url.endsWith('/checkout')) throw new Error(`expected /checkout, got ${result.url}`);
  if (!result.title || !result.total) throw new Error('checkout page was not rendered');
  return result;
}

const browser = await chromium.launch({ executablePath: chrome });
const context = await browser.newContext({ baseURL, reducedMotion: 'reduce', viewport: { width: 1280, height: 860 } });
try {
  const cartPage = await context.newPage();
  const cartErrors = [];
  cartPage.on('pageerror', error => cartErrors.push(String(error)));
  await cartPage.goto('/cart');
  const cart = await validateCartPage(cartPage);
  await cartPage.close();

  const checkoutPage = await context.newPage();
  const checkoutErrors = [];
  checkoutPage.on('pageerror', error => checkoutErrors.push(String(error)));
  await checkoutPage.goto('/checkout');
  const checkout = await validateCheckoutPage(checkoutPage);
  await checkoutPage.close();

  const backPage = await context.newPage();
  const backErrors = [];
  backPage.on('pageerror', error => backErrors.push(String(error)));
  await backPage.goto('/cart');
  await validateCartPage(backPage);
  await backPage.goto('/checkout');
  await backPage.goBack();
  const back = await validateCartPage(backPage);
  await backPage.close();

  console.log(JSON.stringify({ cart, checkout, back, cartErrors, checkoutErrors, backErrors }, null, 2));
  if ([...cartErrors, ...checkoutErrors, ...backErrors].length) {
    console.error('Browser errors found');
    process.exitCode = 1;
  }
} finally {
  await context.close();
  await browser.close();
}
