import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { generatePublicId } from './security.js';
import { PRODUCT, totalsFor } from './pricing.js';

export class StoreError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = 'StoreError';
    this.code = code;
    this.details = details;
  }
}

export function openDatabase(dbPath) {
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  const db = new DatabaseSync(dbPath);
  db.exec('PRAGMA journal_mode = WAL');
  db.exec('PRAGMA foreign_keys = ON');
  db.exec('PRAGMA busy_timeout = 5000');
  db.exec(`
    CREATE TABLE IF NOT EXISTS carts (
      id TEXT PRIMARY KEY,
      quantity INTEGER NOT NULL CHECK (quantity BETWEEN 1 AND ${PRODUCT.maxQuantity}),
      revision INTEGER NOT NULL DEFAULT 1 CHECK (revision >= 1),
      status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'completed')),
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS orders (
      id TEXT PRIMARY KEY,
      public_id TEXT NOT NULL UNIQUE,
      cart_id TEXT NOT NULL UNIQUE REFERENCES carts(id),
      idempotency_key TEXT NOT NULL UNIQUE,
      quantity INTEGER NOT NULL CHECK (quantity BETWEEN 1 AND ${PRODUCT.maxQuantity}),
      unit_price_paise INTEGER NOT NULL,
      delivery_paise INTEGER NOT NULL,
      subtotal_paise INTEGER NOT NULL,
      total_paise INTEGER NOT NULL,
      customer_json TEXT NOT NULL,
      email_normalized TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'reserved',
      created_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_orders_lookup ON orders(public_id, email_normalized);
    CREATE INDEX IF NOT EXISTS idx_orders_created ON orders(created_at);
  `);
  return db;
}

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

export function createStore(db) {
  const statements = {
    getCart: db.prepare('SELECT * FROM carts WHERE id = ?'),
    insertCart: db.prepare(`
      INSERT INTO carts (id, quantity, revision, status, created_at, updated_at)
      VALUES (?, ?, 1, 'active', ?, ?)
    `),
    updateCart: db.prepare(`
      UPDATE carts
      SET quantity = ?, revision = revision + 1, updated_at = ?
      WHERE id = ? AND revision = ? AND status = 'active'
    `),
    completeCart: db.prepare(`
      UPDATE carts SET status = 'completed', updated_at = ? WHERE id = ? AND status = 'active'
    `),
    getOrderByPublicId: db.prepare('SELECT * FROM orders WHERE public_id = ?'),
    getOrderByCartId: db.prepare('SELECT * FROM orders WHERE cart_id = ?'),
    getOrderByKey: db.prepare('SELECT * FROM orders WHERE idempotency_key = ?'),
    findOrderForLookup: db.prepare('SELECT * FROM orders WHERE public_id = ? AND email_normalized = ?'),
    insertOrder: db.prepare(`
      INSERT INTO orders (
        id, public_id, cart_id, idempotency_key, quantity, unit_price_paise,
        delivery_paise, subtotal_paise, total_paise, customer_json,
        email_normalized, status, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'reserved', ?)
    `),
    opsSearch: db.prepare(`
      SELECT public_id, cart_id, idempotency_key, quantity, total_paise, status, created_at
      FROM orders WHERE public_id = ?
    `),
    health: db.prepare('SELECT 1 AS ok'),
  };

  function transaction(fn) {
    db.exec('BEGIN IMMEDIATE');
    try {
      const result = fn();
      db.exec('COMMIT');
      return result;
    } catch (error) {
      try {
        db.exec('ROLLBACK');
      } catch {
        // The transaction may already be rolled back by SQLite.
      }
      throw error;
    }
  }

  function createCart(quantity = 1, now = new Date().toISOString()) {
    const id = crypto.randomUUID();
    statements.insertCart.run(id, quantity, now, now);
    return cartRowToView(statements.getCart.get(id));
  }

  function getCart(id) {
    return cartRowToView(statements.getCart.get(id));
  }

  function updateCartQuantity({ cartId, expectedRevision, quantity, now = new Date().toISOString() }) {
    return transaction(() => {
      let cart = cartId ? statements.getCart.get(cartId) : null;

      if (!cart) {
        if (cartId || expectedRevision !== 0) {
          throw new StoreError('CART_NOT_FOUND', 'That cart could not be found.');
        }
        return createCart(quantity, now);
      }

      if (cart.status !== 'active') {
        throw new StoreError('CART_COMPLETED', 'This cart has already been ordered.', {
          cart: cartRowToView(cart),
        });
      }

      if (cart.revision !== expectedRevision) {
        throw new StoreError('CART_CONFLICT', 'This cart changed somewhere else.', {
          cart: cartRowToView(cart),
        });
      }

      statements.updateCart.run(quantity, now, cart.id, expectedRevision);
      cart = statements.getCart.get(cart.id);
      return cartRowToView(cart);
    });
  }

  function placeOrder({ cartId, expectedRevision, idempotencyKey, customer, now = new Date().toISOString() }) {
    return transaction(() => {
      const replay = statements.getOrderByKey.get(idempotencyKey);
      if (replay) {
        if (cartId && replay.cart_id !== cartId) {
          throw new StoreError('IDEMPOTENCY_CONFLICT', 'That request key was already used for another cart.');
        }
        return { order: orderRowToView(replay), replay: true };
      }

      let cart = cartId ? statements.getCart.get(cartId) : null;

      if (!cart) {
        if (cartId) {
          throw new StoreError('CART_NOT_FOUND', 'That cart could not be found.');
        }
        if (expectedRevision !== 0) {
          throw new StoreError('CART_CONFLICT', 'That cart expired. Review the current total and try again.', {
            cart: null,
          });
        }
        cart = statements.getCart.get(createCart(1, now).id);
      }

      if (cart.status !== 'active') {
        // The replay lookup above returns the existing order only when the
        // caller presents the same idempotency key. A different key must not
        // receive that order, because it has not been authorized for it.
        throw new StoreError('CART_COMPLETED', 'This cart has already been ordered.', {
          cart: cartRowToView(cart),
        });
      }

      if (cartId && cart.revision !== expectedRevision) {
        throw new StoreError('CART_CONFLICT', 'This cart changed somewhere else.', {
          cart: cartRowToView(cart),
        });
      }

      const totals = totalsFor(cart.quantity);
      const orderId = crypto.randomUUID();
      let publicId = generatePublicId();
      let inserted = false;

      for (let attempt = 0; attempt < 6 && !inserted; attempt += 1) {
        try {
          statements.insertOrder.run(
            orderId,
            publicId,
            cart.id,
            idempotencyKey,
            cart.quantity,
            totals.unitPricePaise,
            totals.deliveryPaise,
            totals.subtotalPaise,
            totals.totalPaise,
            JSON.stringify(customer),
            customer.email,
            now,
          );
          inserted = true;
        } catch (error) {
          if (String(error?.code || '').includes('SQLITE_CONSTRAINT') && attempt < 5) {
            publicId = generatePublicId();
            continue;
          }
          throw error;
        }
      }

      if (!inserted) {
        throw new StoreError('ORDER_CREATE_FAILED', 'The order could not be created.');
      }

      statements.completeCart.run(now, cart.id);
      const order = statements.getOrderByPublicId.get(publicId);
      return { order: orderRowToView(order), replay: false };
    });
  }

  function getOrderByPublicId(publicId) {
    return orderRowToView(statements.getOrderByPublicId.get(publicId));
  }

  function getOrderByIdempotencyKey(idempotencyKey) {
    return orderRowToView(statements.getOrderByKey.get(idempotencyKey));
  }

  function findOrderForLookup(publicId, emailNormalized) {
    return orderRowToView(statements.findOrderForLookup.get(publicId, emailNormalized));
  }

  function opsSearch(publicId) {
    const row = statements.opsSearch.get(publicId);
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

  function health() {
    return statements.health.get()?.ok === 1;
  }

  return {
    db,
    createCart,
    getCart,
    updateCartQuantity,
    placeOrder,
    getOrderByPublicId,
    getOrderByIdempotencyKey,
    findOrderForLookup,
    opsSearch,
    health,
  };
}
