import { PRODUCT } from '../pricing.js';

// Whole rupees stay compact; a future fractional price keeps both paise digits.
export function formatINR(paise, currency = PRODUCT.currency) {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency,
    minimumFractionDigits: paise % 100 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(paise / 100);
}
