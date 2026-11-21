export const PRODUCT = Object.freeze({
  name: 'TrailTurn',
  tagline: 'A route your dog can feel. And return to.',
  unitPricePaise: 289900,
  deliveryPaise: 4900,
  maxQuantity: 5,
  currency: 'INR',
  sku: 'TT-DRUM-01',
});

export const MIN_QUANTITY = 1;

export function clampQuantity(value) {
  const quantity = Number.parseInt(String(value), 10);
  if (!Number.isFinite(quantity)) return MIN_QUANTITY;
  return Math.min(PRODUCT.maxQuantity, Math.max(MIN_QUANTITY, quantity));
}

export function totalsFor(value) {
  const quantity = clampQuantity(value);
  const subtotalPaise = PRODUCT.unitPricePaise * quantity;
  const totalPaise = subtotalPaise + PRODUCT.deliveryPaise;
  return {
    quantity,
    unitPricePaise: PRODUCT.unitPricePaise,
    deliveryPaise: PRODUCT.deliveryPaise,
    subtotalPaise,
    totalPaise,
    currency: PRODUCT.currency,
  };
}

export function formatINR(paise) {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(paise / 100);
}

export function formatINRDecimal(paise) {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(paise / 100);
}
