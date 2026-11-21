export const PRODUCT = Object.freeze({
  name: 'TrailTurn',
  tagline: 'A route your dog can feel. And return to.',
  description: 'A low green floor toy with three broad cream nose paddles and a reward cup in front. Your dog follows the raised paddle through a changing sequence to release a measured portion.',
  unitPricePaise: 149900,
  deliveryPaise: 4900,
  maxQuantity: 5,
  currency: 'INR',
  sku: 'TT-DRUM-01',
});

export function totalsFor(quantity) {
  if (!Number.isSafeInteger(quantity) || quantity < 0 || quantity > PRODUCT.maxQuantity) {
    throw new RangeError(`Basket quantity must be a whole number from 0 to ${PRODUCT.maxQuantity}.`);
  }
  const subtotalPaise = PRODUCT.unitPricePaise * quantity;
  const deliveryPaise = quantity === 0 ? 0 : PRODUCT.deliveryPaise;
  return {
    quantity,
    unitPricePaise: PRODUCT.unitPricePaise,
    deliveryPaise,
    subtotalPaise,
    totalPaise: subtotalPaise + deliveryPaise,
    currency: PRODUCT.currency,
  };
}
