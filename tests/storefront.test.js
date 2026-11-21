import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { createApp } from '../server.js';
import { totalsFor } from '../src/pricing.js';
import { formatINR } from '../src/views/money.js';
import { validateCustomer, validateQuantity } from '../src/validation.js';

const customer = {
  fullName: 'Asha Rao', email: 'Asha@example.test', phone: '+91 98765 43210',
  address1: 'Demo flat <B> & unit 4', city: 'Pune', state: 'Maharashtra', pin: '411001',
};

async function launch(dbPath = ':memory:') {
  const { server, db } = createApp({ dbPath, logger: {} });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  return { db, base, request: (path, opts) => fetch(base + path, { redirect: 'manual', ...opts }),
    close: () => new Promise(resolve => server.close(resolve)) };
}

async function guest(app) {
  const home = await app.request('/');
  const cookie = home.headers.getSetCookie().map(c => c.split(';')[0]).join('; ');
  const csrf = /tt_csrf=([^; ]+)/.exec(cookie)[1];
  const cartId = /data-cart-id="([^"]+)"/.exec(await home.text())[1];
  const json = (path, body, etag, extra = {}) => app.request(path, {
    method: path === '/api/cart' ? 'PUT' : 'POST',
    headers: { cookie, origin: app.base, 'content-type': 'application/json', 'x-csrf-token': csrf,
      ...(etag && { 'if-match': etag }), ...extra }, body: JSON.stringify(body),
  });
  const form = (path, body) => app.request(path, { method: 'POST', headers: { cookie, origin: app.base },
    body: new URLSearchParams({ csrf, ...body }) });
  return { cartId, cookie, csrf, json, form, etag: `"cart-${cartId}-1"` };
}

test('server prices an empty basket and charges delivery once for one, two or five units', () => {
  for (const [qty, subtotal, delivery, total, display] of [
    [0, 0, 0, 0, '₹0'], [1, 149900, 4900, 154800, '₹1,548'],
    [2, 299800, 4900, 304700, '₹3,047'], [5, 749500, 4900, 754400, '₹7,544'],
  ]) {
    const quote = totalsFor(qty);
    assert.deepEqual([quote.subtotalPaise, quote.deliveryPaise, quote.totalPaise, formatINR(quote.totalPaise)], [subtotal, delivery, total, display]);
  }
});

test('Indian address and basket quantity validation', () => {
  assert.equal(validateCustomer(customer).values.phone, '9876543210');
  for (const patch of [{ phone: '98765432101' }, { pin: '4110019' }, { pin: '011001' }, { state: 'Unknown' }])
    assert.equal(validateCustomer({ ...customer, ...patch }).ok, false);
  for (const q of [-1, 6, 1.5, '2abc', null, '', ' ']) assert.equal(validateQuantity(q).ok, false);
});

test('cart writes require revision, session token and same origin', async t => {
  const app = await launch(); t.after(app.close);
  const g = await guest(app);
  assert.equal((await g.json('/api/cart', { quantity: 2 })).status, 428);
  assert.equal((await g.json('/api/cart', { quantity: 2 }, g.etag, { 'x-csrf-token': '' })).status, 403);
  assert.equal((await g.json('/api/cart', { quantity: 2 }, g.etag, { origin: 'https://other.example' })).status, 403);
  assert.equal((await g.json('/api/cart', { quantity: 6 }, g.etag)).status, 422);
  assert.equal((await g.json('/api/cart', { quantity: 2 }, g.etag)).status, 200);
  const stale = await g.json('/api/cart', { quantity: 4 }, g.etag);
  assert.equal(stale.status, 409);
  assert.equal((await stale.json()).cart.quantity, 2);
});

test('concurrent checkout, lost response, clean receipt reload and restart', async t => {
  const dir = await mkdtemp(join(tmpdir(), 'trailturn-test-'));
  const dbPath = join(dir, 'shop.db');
  let app = await launch(dbPath);
  t.after(async () => { await app.close(); await rm(dir, { recursive: true, force: true }); });
  const g = await guest(app);
  const update = await g.json('/api/cart', { quantity: 3 }, g.etag);
  const etag = update.headers.get('etag');
  const body = { customer, cartId: g.cartId, idempotencyKey: randomUUID(), totalPaise: 0 };
  assert.equal((await g.json('/api/orders', body, g.etag)).status, 409);
  const responses = await Promise.all([g.json('/api/orders', body, etag), g.json('/api/orders', body, etag)]);
  assert.deepEqual(responses.map(r => r.status).sort(), [200, 201]);
  const [a, b] = await Promise.all(responses.map(r => r.json()));
  assert.equal(a.order.publicId, b.order.publicId);
  assert.equal(a.order.totalPaise, 454600);
  const sessionCookie = g.cookie.split('; ').filter(c => !c.startsWith('tt_cart=')).join('; ');
  const retry = await g.json('/api/orders', body, etag, { cookie: sessionCookie });
  assert.equal((await retry.json()).order.publicId, a.order.publicId);
  assert.equal(app.db.prepare('SELECT COUNT(*) AS n FROM orders').get().n, 1);
  await app.close();
  app = await launch(dbPath);
  const clean = `/receipt/${a.order.publicId}`;
  const locked = await app.request(clean);
  assert.equal(locked.status, 404);
  assert.doesNotMatch(await locked.text(), /Demo flat/);
  const link = await app.request(a.order.receiptUrl);
  assert.equal(link.headers.get('location'), clean);
  const cookie = link.headers.getSetCookie()[0].split(';')[0];
  for (let visit = 0; visit < 2; visit++) {
    const r = await app.request(clean, { headers: { cookie } });
    assert.equal(r.status, 200);
    assert.match(await r.text(), /Demo flat &lt;B&gt; &amp; unit 4/);
  }
  const other = await guest(app);
  const attempt = { cartId: body.cartId, idempotencyKey: body.idempotencyKey };
  const status = await other.json('/api/orders/status', attempt, null, { cookie: sessionCookie, 'x-csrf-token': g.csrf });
  assert.equal((await status.json()).order.publicId, a.order.publicId);
  const separateSession = await other.json('/api/orders/status', attempt);
  assert.deepEqual(await separateSession.json(), { order: null });
  assert.equal(app.db.prepare('SELECT COUNT(*) AS n FROM orders').get().n, 1);
  assert.equal((await other.form('/receipt/lookup', { orderRef: a.order.publicId, email: 'other@example.test' })).status, 404);
  const lookup = await other.form('/receipt/lookup', { orderRef: a.order.publicId, email: customer.email });
  assert.equal(lookup.headers.get('location'), clean);
});

test('ordinary HTML checkout works for one item and preserves invalid input', async t => {
  const app = await launch(); t.after(app.close);
  const g = await guest(app);
  const updated = await g.form('/cart', { cartId: g.cartId, revision: 1, quantity: '1' });
  assert.equal(updated.status, 303);
  const fields = { ...customer, cartId: g.cartId, revision: 2, idempotencyKey: randomUUID() };
  const invalid = await g.form('/checkout', { ...fields, pin: '' });
  assert.equal(invalid.status, 422);
  assert.match(await invalid.text(), /value="Demo flat &lt;B&gt; &amp; unit 4"/);
  const r = await g.form('/checkout', fields);
  assert.equal(r.status, 303);
  assert.match(r.headers.get('location'), /^\/receipt\/TT-/);
  assert.equal(app.db.prepare('SELECT total_paise FROM orders').get().total_paise, 154800);
});

test('removing the last unit persists zero and neither checkout can commit it', async t => {
  const app = await launch(); t.after(app.close);
  const g = await guest(app);
  const added = await g.json('/api/cart', { quantity: 1 }, g.etag);
  const empty = await g.json('/api/cart', { quantity: 0 }, added.headers.get('etag'));
  const { cart, etag } = await empty.json();
  assert.equal(cart.totals.totalPaise, 0);
  const html = await (await app.request('/', { headers: { cookie: g.cookie } })).text();
  assert.match(html, /data-total>₹0</);
  assert.match(html, /data-checkout-submit disabled/);
  const idempotencyKey = randomUUID();
  const result = await g.json('/api/orders', { customer, cartId: cart.id, idempotencyKey }, etag);
  assert.equal(result.status, 422);
  assert.equal((await result.json()).code, 'empty_cart');
  assert.equal((await g.form('/checkout', { ...customer, cartId: cart.id, revision: cart.revision, idempotencyKey })).status, 422);
  assert.equal(app.db.prepare('SELECT COUNT(*) AS n FROM orders').get().n, 0);
});

test('lookup rate limit sends a retry time', async t => {
  const app = await launch(); t.after(app.close);
  const g = await guest(app);
  let last;
  for (let i = 0; i < 13; i++) last = await g.form('/receipt/lookup', {});
  assert.equal(last.status, 429);
  assert.ok(Number(last.headers.get('retry-after')) > 0);
});
