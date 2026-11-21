-- Single-SKU shop: the orders row also contains its one immutable line.
-- quantity counts whole toys; unit_price_paise, subtotal_paise, delivery_paise
-- and total_paise are integers in INR minor units (100 paise = 1 rupee).
-- Historical defaults describe the only product sold before schema version 2.
ALTER TABLE orders ADD COLUMN sku TEXT NOT NULL DEFAULT 'TT-DRUM-01';
ALTER TABLE orders ADD COLUMN product_name TEXT NOT NULL DEFAULT 'TrailTurn';
ALTER TABLE orders ADD COLUMN currency TEXT NOT NULL DEFAULT 'INR';

-- Only a digest of the random guest cookie is persisted. Pre-v2 carts have
-- no recorded session owner. An active legacy cart may be bound once.
ALTER TABLE carts ADD COLUMN guest_id TEXT CHECK (length(guest_id) = 64);
CREATE TRIGGER cart_requires_guest BEFORE INSERT ON carts WHEN NEW.guest_id IS NULL
BEGIN SELECT RAISE(ABORT, 'cart requires guest'); END;
CREATE TRIGGER cart_owner_fixed BEFORE UPDATE OF guest_id ON carts
WHEN OLD.guest_id IS NOT NULL OR OLD.status != 'active' OR NEW.guest_id IS NULL
BEGIN SELECT RAISE(ABORT, 'cart owner is fixed'); END;

-- cart_id UNIQUE and idempotency_key UNIQUE already enforce one committed
-- order per cart and one result per guest-scoped checkout attempt.
CREATE TRIGGER order_snapshot_valid BEFORE INSERT ON orders
WHEN typeof(NEW.quantity) != 'integer' OR NEW.quantity < 1
  OR typeof(NEW.unit_price_paise) != 'integer' OR NEW.unit_price_paise < 0
  OR typeof(NEW.delivery_paise) != 'integer' OR NEW.delivery_paise < 0
  OR typeof(NEW.subtotal_paise) != 'integer' OR NEW.subtotal_paise != NEW.quantity * NEW.unit_price_paise
  OR typeof(NEW.total_paise) != 'integer' OR NEW.total_paise != NEW.subtotal_paise + NEW.delivery_paise
  OR NOT EXISTS (SELECT 1 FROM carts WHERE id = NEW.cart_id AND guest_id IS NOT NULL AND status = 'active')
BEGIN SELECT RAISE(ABORT, 'invalid order snapshot'); END;
CREATE TRIGGER order_snapshot_fixed BEFORE UPDATE ON orders
BEGIN SELECT RAISE(ABORT, 'demo orders are immutable'); END;
