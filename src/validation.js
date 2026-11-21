import { PRODUCT } from './pricing.js';

export const INDIAN_STATES = Object.freeze([
  'Andhra Pradesh',
  'Arunachal Pradesh',
  'Assam',
  'Bihar',
  'Chhattisgarh',
  'Goa',
  'Gujarat',
  'Haryana',
  'Himachal Pradesh',
  'Jharkhand',
  'Karnataka',
  'Kerala',
  'Madhya Pradesh',
  'Maharashtra',
  'Manipur',
  'Meghalaya',
  'Mizoram',
  'Nagaland',
  'Odisha',
  'Punjab',
  'Rajasthan',
  'Sikkim',
  'Tamil Nadu',
  'Telangana',
  'Tripura',
  'Uttar Pradesh',
  'Uttarakhand',
  'West Bengal',
  'Andaman and Nicobar Islands',
  'Chandigarh',
  'Dadra and Nagar Haveli and Daman and Diu',
  'Delhi',
  'Jammu and Kashmir',
  'Ladakh',
  'Lakshadweep',
  'Puducherry',
]);

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/u;
const NAME_PATTERN = /^[\p{L}\p{M}][\p{L}\p{M}\s.'-]*$/u;
const PIN_PATTERN = /^[1-9][0-9]{5}$/;
const ORDER_REF_PATTERN = /^TT-[A-HJ-NP-Z2-9]{8}$/;

function text(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

export function normalizePhone(value) {
  let digits = String(value ?? '').replace(/[+\s()-]/g, '');
  if (digits.length === 12 && digits.startsWith('91')) digits = digits.slice(2);
  if (digits.length === 11 && digits.startsWith('0')) digits = digits.slice(1);
  return digits;
}

export function normalizeEmail(value) {
  return text(value).toLowerCase();
}

export function normalizeOrderRef(value) {
  return text(value).toUpperCase();
}

export function isValidOrderRef(value) {
  return ORDER_REF_PATTERN.test(normalizeOrderRef(value));
}

export function validateCustomer(input = {}) {
  const values = {
    fullName: text(input.fullName).slice(0, 80),
    email: normalizeEmail(input.email).slice(0, 254),
    phone: normalizePhone(input.phone),
    address1: text(input.address1).slice(0, 120),
    address2: text(input.address2).slice(0, 120),
    city: text(input.city).slice(0, 60),
    state: text(input.state).slice(0, 80),
    pin: text(input.pin),
  };

  const errors = {};

  if (values.fullName.length < 2) {
    errors.fullName = 'Enter the name the delivery is for.';
  } else if (!NAME_PATTERN.test(values.fullName)) {
    errors.fullName = 'Use letters, spaces, apostrophes, periods, or hyphens.';
  }

  if (!values.email) {
    errors.email = 'Enter an email address for the receipt.';
  } else if (values.email.length > 254 || !EMAIL_PATTERN.test(values.email)) {
    errors.email = 'Enter a valid email address, like name@example.com.';
  }

  if (!values.phone) {
    errors.phone = 'Enter a 10-digit Indian mobile number.';
  } else if (!/^[6-9][0-9]{9}$/.test(values.phone)) {
    errors.phone = 'Use a 10-digit mobile number starting with 6, 7, 8, or 9.';
  }

  if (values.address1.length < 5) {
    errors.address1 = 'Enter the street address, building, or house number.';
  }

  if (values.city.length < 2) {
    errors.city = 'Enter the city or town.';
  }

  if (!INDIAN_STATES.includes(values.state)) {
    errors.state = 'Choose a state or union territory.';
  }

  if (!values.pin) {
    errors.pin = 'Enter the 6-digit PIN code.';
  } else if (!PIN_PATTERN.test(values.pin)) {
    errors.pin = 'Enter a valid 6-digit PIN code. It cannot start with 0.';
  }

  return {
    ok: Object.keys(errors).length === 0,
    values,
    errors,
  };
}

export function validateQuantity(value) {
  const quantity = typeof value === 'number' || (typeof value === 'string' && /^\d+$/.test(value)) ? Number(value) : NaN;
  if (!Number.isSafeInteger(quantity) || quantity < 0) {
    return { ok: false, message: 'Choose a whole quantity of zero or more.' };
  }
  if (quantity > PRODUCT.maxQuantity) {
    return { ok: false, quantity: PRODUCT.maxQuantity, message: `The demo limit is ${PRODUCT.maxQuantity} units per order.` };
  }
  return { ok: true, quantity };
}

export function validateLookup(input = {}) {
  const values = {
    orderRef: normalizeOrderRef(input.orderRef).slice(0, 24),
    email: normalizeEmail(input.email).slice(0, 254),
  };
  const errors = {};
  if (!isValidOrderRef(values.orderRef)) {
    errors.orderRef = 'Enter the order reference from your receipt, like TT-7K4M9P2Q.';
  }
  if (!values.email || !EMAIL_PATTERN.test(values.email)) {
    errors.email = 'Enter the email used for the order.';
  }
  return { ok: Object.keys(errors).length === 0, values, errors };
}

export function maskEmail(email) {
  const [name, domain] = String(email).split('@');
  if (!domain) return 'hidden';
  const visible = name.slice(0, 1);
  return `${visible}${'•'.repeat(Math.max(2, Math.min(6, name.length - 1)))}@${domain}`;
}

export function maskPhone(phone) {
  const digits = String(phone).replace(/\D/g, '');
  if (digits.length < 4) return 'hidden';
  return `••••••${digits.slice(-4)}`;
}
