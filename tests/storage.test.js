import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { DatabaseSync } from 'node:sqlite';
import { openDatabase } from '../src/db.js';

function isolated(t) {
  const dir = mkdtempSync(join(tmpdir(), 'trailturn-storage-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  return join(dir, 'isolated.db');
}

test('v1 → v2 adds historical line metadata without rewriting saved amounts or identifiers', t => {
  const file = isolated(t);
  const old = new DatabaseSync(file);
  old.exec(readFileSync(new URL('../src/migrations/001-basket.sql', import.meta.url), 'utf8'));
  old.exec(`PRAGMA user_version=1;
    INSERT INTO carts VALUES ('cart-a',2,5,'completed','created','updated');
    INSERT INTO orders VALUES ('order-a','TT-ABCD2345','cart-a','attempt-a',2,
      289900,4900,579800,584700,'{}','guest@example.test','reserved','created');`);
  const original = old.prepare('SELECT * FROM orders').get();
  old.close();
  for (let i = 0; i < 2; i++) {
    const db = openDatabase(file);
    try {
      assert.equal(db.prepare('PRAGMA user_version').get().user_version, 2);
      const { sku, product_name, currency, ...preserved } = db.prepare('SELECT * FROM orders').get();
      assert.deepEqual(preserved, { ...original });
      assert.deepEqual([sku, product_name, currency], ['TT-DRUM-01', 'TrailTurn', 'INR']);
      const cart = db.prepare('SELECT * FROM carts').get();
      assert.deepEqual([cart.id, cart.revision, cart.status, cart.guest_id], ['cart-a', 5, 'completed', null]);
      assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(), []);
      assert.throws(() => db.exec('UPDATE orders SET total_paise=0'), /immutable/);
    } finally { db.close(); }
  }
});

test('an authorized receipt and attempt survive reopening the file in a fresh Node process', async t => {
  const dbPath = isolated(t);
  // The server reads its paths and signing secret on first import.
  const oldDataDir = process.env.DATA_DIR;
  process.env.DATA_DIR = dirname(dbPath);
  t.after(() => {
    if (oldDataDir === undefined) delete process.env.DATA_DIR;
    else process.env.DATA_DIR = oldDataDir;
  });
  const { createApp } = await import('../server.js');
  const app = createApp({ dbPath, logger: {} });
  await new Promise(resolve => app.server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${app.server.address().port}`;
  let saved;
  try {
    const page = await fetch(base);
    const cookie = page.headers.getSetCookie().map(s => s.split(';')[0]).join('; ');
    const csrf = /tt_csrf=([^;]+)/.exec(cookie)[1];
    const cartId = /tt_cart=([^;]+)/.exec(cookie)[1];
    const headers = { cookie, origin: base, 'x-csrf-token': csrf, 'content-type': 'application/json' };
    const cart = await fetch(`${base}/api/cart`, { method: 'PUT', headers: { ...headers, 'if-match': `"cart-${cartId}-1"` }, body: '{"quantity":2}' });
    assert.equal(cart.status, 200);
    const key = 'restart-fixture';
    const result = await fetch(`${base}/api/orders`, { method: 'POST', headers: { ...headers, 'if-match': cart.headers.get('etag') },
      body: JSON.stringify({ cartId, idempotencyKey: key, customer: { fullName: 'Demo Guest', email: 'demo@example.test',
        phone: '9876543210', address1: 'Demo Lane 1', city: 'Pune', state: 'Maharashtra', pin: '411001', deliveryNotes: 'unused' } }) });
    assert.equal(result.status, 201);
    const { order } = await result.json();
    const row = app.db.prepare('SELECT * FROM orders WHERE public_id=?').get(order.publicId);
    assert.ok(!Object.hasOwn(JSON.parse(row.customer_json), 'deliveryNotes'));
    const owner = app.db.prepare('SELECT guest_id FROM carts WHERE id=?').get(cartId).guest_id;
    assert.match(owner, /^[a-f0-9]{64}$/);
    assert.equal(app.store.getCart(cartId, 'a-different-session'), null);
    const receiptCookie = result.headers.getSetCookie().find(c => c.startsWith('tt_receipt_')).split(';')[0];
    saved = { cookie, csrf, cartId, key, ref: order.publicId, receiptCookie };
  } finally { await new Promise(resolve => app.server.close(resolve)); }

  // Separate JS heap, SQLite connection and HTTP listener; only the file and
  // signing secret persist. No access to a developer's database in either run.
  execFileSync(process.execPath, ['--input-type=module', '-e', `
    import assert from 'node:assert/strict';
    import { createApp } from ${JSON.stringify(new URL('../server.js', import.meta.url).href)};
    const saved = JSON.parse(process.env.TEST_ATTEMPT);
    const { server } = createApp({ logger: {} });
    await new Promise(r => server.listen(0,'127.0.0.1',r));
    try {
      const base = 'http://127.0.0.1:' + server.address().port;
      const receipt = await fetch(base+'/receipt/'+saved.ref, { headers: { cookie: saved.receiptCookie } });
      assert.equal(receipt.status,200);
      const html = await receipt.text();
      for (const value of [saved.ref,'Demo Lane 1','TT-DRUM-01','₹3,047']) assert.ok(html.includes(value));
      const status = await fetch(base+'/api/orders/status', { method:'POST',
        headers:{cookie:saved.cookie,origin:base,'content-type':'application/json','x-csrf-token':saved.csrf},
        body:JSON.stringify({cartId:saved.cartId,idempotencyKey:saved.key}) });
      assert.equal((await status.json()).order.publicId,saved.ref);
    } finally { await new Promise(r => server.close(r)); }
  `], { timeout: 15000, env: { ...process.env, DB_PATH: dbPath, TEST_ATTEMPT: JSON.stringify(saved) } });
});
