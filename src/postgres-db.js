import crypto from 'node:crypto';
import { Pool } from '@neondatabase/serverless';
import { generatePublicId } from './security.js';
import { PRODUCT, totalsFor } from './pricing.js';
import { StoreError } from './db.js';

function cartRowToView(row) {
  if (!row) return null;
  return {
    id: row.id,
    quantity: row.quantity,
    revision: row.revision,
    status: row.status,
    totals: totalsFor(row.quantity),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function orderRowToView(row) {
  if (!row) return null;
  let customer = {};
  try {
    customer = JSON.parse(row.customer_json);
  } catch {
    customer = {};
  }
  return {
    id: row.id,
    publicId: row.public_id,
    cartId: row.cart_id,
    idempotencyKey: row.idempotency_key,
    sku: row.sku,
    productName: row.product_name,
    currency: row.currency,
    quantity: row.quantity,
    unitPricePaise: row.unit_price_paise,
    deliveryPaise: row.delivery_paise,
    subtotalPaise: row.subtotal_paise,
    totalPaise: row.total_paise,
    customer,
    emailNormalized: row.email_normalized,
    status: row.status,
    createdAt: row.created_at,
  };
}

export function openPostgresDatabase(connectionString) {
  const pool = new Pool({ connectionString });
  const ready = pool.query(`
    CREATE TABLE IF NOT EXISTS carts (
      id TEXT PRIMARY KEY,
      guest_id TEXT,
      quantity INTEGER NOT NULL,
      revision INTEGER NOT NULL DEFAULT 1,
      status TEXT NOT NULL DEFAULT 'active',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS orders (
      id TEXT PRIMARY KEY,
      public_id TEXT NOT NULL UNIQUE,
      cart_id TEXT NOT NULL UNIQUE REFERENCES carts(id),
      idempotency_key TEXT NOT NULL,
      quantity INTEGER NOT NULL,
      unit_price_paise INTEGER NOT NULL,
      delivery_paise INTEGER NOT NULL,
      subtotal_paise INTEGER NOT NULL,
      total_paise INTEGER NOT NULL,
      customer_json TEXT NOT NULL,
      email_normalized TEXT NOT NULL,
      status TEXT NOT NULL,
      created_at TEXT NOT NULL,
      sku TEXT NOT NULL,
      product_name TEXT NOT NULL,
      currency TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS orders_idempotency_idx ON orders(idempotency_key);
  `);
  const originalQuery = pool.query.bind(pool);
  pool.query = async (...args) => {
    await ready;
    return originalQuery(...args);
  };
  const originalConnect = pool.connect.bind(pool);
  pool.connect = async () => {
    await ready;
    return originalConnect();
  };
  pool.ready = ready;
  return pool;
}

export function createPostgresStore(pool) {
  async function getCart(id, guestId) {
    const result = await pool.query(
      'SELECT * FROM carts WHERE id = $1 AND guest_id = $2',
      [id, guestId],
    );
    return cartRowToView(result.rows[0]);
  }

  async function createCart(guestId, quantity = 0, now = new Date().toISOString()) {
    totalsFor(quantity);
    const id = crypto.randomUUID();
    await pool.query(
      `INSERT INTO carts (id, guest_id, quantity, revision, status, created_at, updated_at)
       VALUES ($1, $2, $3, 1, 'active', $4, $4)`,
      [id, guestId, quantity, now],
    );
    return getCart(id, guestId);
  }

  async function updateCartQuantity({ cartId, guestId, expectedRevision, quantity, now = new Date().toISOString() }) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const current = cartId
        ? (await client.query('SELECT * FROM carts WHERE id = $1 AND guest_id = $2', [cartId, guestId])).rows[0]
        : null;
      if (!current) {
        if (cartId || expectedRevision !== 0) {
          throw new StoreError('CART_NOT_FOUND', 'That cart could not be found.');
        }
        const id = crypto.randomUUID();
        await client.query(
          `INSERT INTO carts (id, guest_id, quantity, revision, status, created_at, updated_at)
           VALUES ($1, $2, $3, 1, 'active', $4, $4)`,
          [id, guestId, quantity, now],
        );
        await client.query('COMMIT');
        return getCart(id, guestId);
      }
      if (current.status !== 'active') throw new StoreError('CART_COMPLETED', 'This cart has already been ordered.');
      if (current.revision !== expectedRevision) {
        throw new StoreError('CART_CONFLICT', 'This cart changed somewhere else.', {
          cart: cartRowToView(current),
        });
      }
      await client.query(
        `UPDATE carts SET quantity = $1, revision = revision + 1, updated_at = $2
         WHERE id = $3 AND revision = $4 AND status = 'active'`,
        [quantity, now, cartId, expectedRevision],
      );
      await client.query('COMMIT');
      return getCart(cartId, guestId);
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async function placeOrder({ cartId, guestId, expectedRevision, idempotencyKey, customer, now = new Date().toISOString() }) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const replayResult = await client.query(
        `SELECT o.* FROM orders o JOIN carts c ON c.id = o.cart_id
         WHERE o.idempotency_key = $1 AND (c.guest_id = $2 OR c.guest_id IS NULL)`,
        [idempotencyKey, guestId],
      );
      const replay = replayResult.rows[0];
      if (replay) {
        if (cartId && replay.cart_id !== cartId) {
          throw new StoreError('IDEMPOTENCY_CONFLICT', 'That request key was already used for another cart.');
        }
        await client.query('COMMIT');
        return { order: orderRowToView(replay), replay: true };
      }

      const cart = cartId
        ? (await client.query('SELECT * FROM carts WHERE id = $1 AND guest_id = $2', [cartId, guestId])).rows[0]
        : null;
      if (!cart) {
        if (cartId) throw new StoreError('CART_NOT_FOUND', 'That cart could not be found.');
        if (expectedRevision !== 0) throw new StoreError('CART_CONFLICT', 'That cart expired.');
        throw new StoreError('EMPTY_CART', 'Add a TrailTurn to your basket before checkout.');
      }
      if (cart.status !== 'active') throw new StoreError('CART_COMPLETED', 'This cart has already been ordered.');
      if (cartId && cart.revision !== expectedRevision) {
        throw new StoreError('CART_CONFLICT', 'This cart changed somewhere else.', {
          cart: cartRowToView(cart),
        });
      }
      if (cart.quantity === 0) throw new StoreError('EMPTY_CART', 'Add a TrailTurn to your basket before checkout.');

      const totals = totalsFor(cart.quantity);
      const orderId = crypto.randomUUID();
      let publicId = generatePublicId();
      let inserted = null;
      for (let attempt = 0; attempt < 6; attempt += 1) {
        try {
          const result = await client.query(
            `INSERT INTO orders (
              id, public_id, cart_id, idempotency_key, quantity, unit_price_paise,
              delivery_paise, subtotal_paise, total_paise, customer_json,
              email_normalized, status, created_at, sku, product_name, currency
            ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'reserved',$12,$13,$14,$15)
            RETURNING *`,
            [
              orderId, publicId, cart.id, idempotencyKey, cart.quantity,
              totals.unitPricePaise, totals.deliveryPaise, totals.subtotalPaise,
              totals.totalPaise, JSON.stringify(customer), customer.email, now,
              PRODUCT.sku, PRODUCT.name, totals.currency,
            ],
          );
          inserted = result.rows[0];
          break;
        } catch (error) {
          if (error?.code === '23505' && attempt < 5) publicId = generatePublicId();
          else throw error;
        }
      }
      if (!inserted) throw new StoreError('ORDER_CREATE_FAILED', 'The order could not be created.');
      await client.query(
        `UPDATE carts SET status = 'completed', updated_at = $1 WHERE id = $2 AND status = 'active'`,
        [now, cart.id],
      );
      await client.query('COMMIT');
      return { order: orderRowToView(inserted), replay: false };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async function getOrderByPublicId(publicId) {
    const result = await pool.query('SELECT * FROM orders WHERE public_id = $1', [publicId]);
    return orderRowToView(result.rows[0]);
  }

  async function getOrderByIdempotencyKey(idempotencyKey, guestId) {
    const result = await pool.query(
      `SELECT o.* FROM orders o JOIN carts c ON c.id = o.cart_id
       WHERE o.idempotency_key = $1 AND (c.guest_id = $2 OR c.guest_id IS NULL)`,
      [idempotencyKey, guestId],
    );
    return orderRowToView(result.rows[0]);
  }

  async function findOrderForLookup(publicId, emailNormalized) {
    const result = await pool.query(
      'SELECT * FROM orders WHERE public_id = $1 AND email_normalized = $2',
      [publicId, emailNormalized],
    );
    return orderRowToView(result.rows[0]);
  }

  async function opsSearch(publicId) {
    const result = await pool.query(
      `SELECT public_id, cart_id, idempotency_key, quantity, total_paise, status, created_at
       FROM orders WHERE public_id = $1`,
      [publicId],
    );
    const row = result.rows[0];
    if (!row) return null;
    return {
      publicId: row.public_id,
      cartId: row.cart_id,
      idempotencyKey: row.idempotency_key,
      quantity: row.quantity,
      totalPaise: row.total_paise,
      status: row.status,
      createdAt: row.created_at,
    };
  }

  async function bindLegacyCart(id, guestId) {
    await pool.query(
      `UPDATE carts SET guest_id = $1 WHERE id = $2 AND guest_id IS NULL AND status = 'active'`,
      [guestId, id],
    );
  }

  async function health() {
    const result = await pool.query('SELECT 1 AS ok');
    return result.rows[0]?.ok === 1;
  }

  return {
    db: pool,
    createCart,
    getCart,
    bindLegacyCart,
    updateCartQuantity,
    placeOrder,
    getOrderByPublicId,
    getOrderByIdempotencyKey,
    findOrderForLookup,
    opsSearch,
    health,
  };
}
