CREATE TABLE IF NOT EXISTS carts (
  id TEXT PRIMARY KEY,
  quantity INTEGER NOT NULL CHECK (quantity >= 0),
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
  quantity INTEGER NOT NULL CHECK (quantity >= 1),
  -- All four monetary amounts are integer paise; never store formatted rupees.
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
