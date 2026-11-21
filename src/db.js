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
  // SQLite cannot alter a CHECK constraint. Copy the original rows, including
  // receipt prices, within one transaction; then install the new constraints.
  db.exec('BEGIN IMMEDIATE');
  try {
    const version = db.prepare('PRAGMA user_version').get().user_version;
    if (version > 2) throw new Error(`Unsupported TrailTurn database version ${version}`);
    if (version === 0) {
      const existing = db.prepare("SELECT 1 FROM sqlite_schema WHERE name='carts' AND type='table'").get();
      if (existing) db.exec(`
        CREATE TEMP TABLE old_carts AS SELECT * FROM carts;
        CREATE TEMP TABLE old_orders AS SELECT * FROM orders;
        DROP TABLE orders;
        DROP TABLE carts;
      `);
      db.exec(fs.readFileSync(new URL('./migrations/001-basket.sql', import.meta.url), 'utf8'));
      if (existing) db.exec(`
        INSERT INTO carts SELECT * FROM old_carts;
        INSERT INTO orders SELECT * FROM old_orders;
        DROP TABLE old_orders;
        DROP TABLE old_carts;
      `);
      db.exec('PRAGMA user_version = 1');
    }
    if (version < 2) {
      db.exec(fs.readFileSync(new URL('./migrations/002-guest-order-snapshot.sql', import.meta.url), 'utf8'));
      db.exec('PRAGMA user_version = 2');
    }
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    db.close();
    throw error;
  }
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

export function createStore(db) {
  const statements = {
    getCart: db.prepare('SELECT * FROM carts WHERE id = ? AND guest_id = ?'),
    bindLegacyCart: db.prepare("UPDATE carts SET guest_id = ? WHERE id = ? AND guest_id IS NULL AND status = 'active'"),
    insertCart: db.prepare(`
      INSERT INTO carts (id, guest_id, quantity, revision, status, created_at, updated_at)
      VALUES (?, ?, ?, 1, 'active', ?, ?)
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
    getOrderByKey: db.prepare(`SELECT o.* FROM orders o JOIN carts c ON c.id = o.cart_id
      WHERE o.idempotency_key = ? AND (c.guest_id = ? OR c.guest_id IS NULL)`),
    findOrderForLookup: db.prepare('SELECT * FROM orders WHERE public_id = ? AND email_normalized = ?'),
    insertOrder: db.prepare(`
      INSERT INTO orders (
        id, public_id, cart_id, idempotency_key, quantity, unit_price_paise,
        delivery_paise, subtotal_paise, total_paise, customer_json,
        email_normalized, status, created_at, sku, product_name, currency
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'reserved', ?, ?, ?, ?)
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

  function createCart(guestId, quantity = 0, now = new Date().toISOString()) {
    totalsFor(quantity);
    const id = crypto.randomUUID();
    statements.insertCart.run(id, guestId, quantity, now, now);
    return getCart(id, guestId);
  }

  function getCart(id, guestId) {
    return cartRowToView(statements.getCart.get(id, guestId));
  }

  function updateCartQuantity({ cartId, guestId, expectedRevision, quantity, now = new Date().toISOString() }) {
    return transaction(() => {
      let cart = cartId ? statements.getCart.get(cartId, guestId) : null;

      if (!cart) {
        if (cartId || expectedRevision !== 0) {
          throw new StoreError('CART_NOT_FOUND', 'That cart could not be found.');
        }
        return createCart(guestId, quantity, now);
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
      cart = statements.getCart.get(cart.id, guestId);
      return cartRowToView(cart);
    });
  }

  function placeOrder({ cartId, guestId, expectedRevision, idempotencyKey, customer, now = new Date().toISOString() }) {
    return transaction(() => {
      const replay = statements.getOrderByKey.get(idempotencyKey, guestId);
      if (replay) {
        if (cartId && replay.cart_id !== cartId) {
          throw new StoreError('IDEMPOTENCY_CONFLICT', 'That request key was already used for another cart.');
        }
        return { order: orderRowToView(replay), replay: true };
      }

      const cart = cartId ? statements.getCart.get(cartId, guestId) : null;

      if (!cart) {
        if (cartId) {
          throw new StoreError('CART_NOT_FOUND', 'That cart could not be found.');
        }
        if (expectedRevision !== 0) {
          throw new StoreError('CART_CONFLICT', 'That cart expired. Review the current total and try again.', {
            cart: null,
          });
        }
        throw new StoreError('EMPTY_CART', 'Add a TrailTurn to your basket before checkout.');
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

      if (cart.quantity === 0) throw new StoreError('EMPTY_CART', 'Add a TrailTurn to your basket before checkout.');
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
            PRODUCT.sku,
            PRODUCT.name,
            totals.currency,
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

  function getOrderByIdempotencyKey(idempotencyKey, guestId) {
    return orderRowToView(statements.getOrderByKey.get(idempotencyKey, guestId));
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
    bindLegacyCart: (id, guestId) => statements.bindLegacyCart.run(guestId, id),
    updateCartQuantity,
    placeOrder,
    getOrderByPublicId,
    getOrderByIdempotencyKey,
    findOrderForLookup,
    opsSearch,
    health,
  };
}
