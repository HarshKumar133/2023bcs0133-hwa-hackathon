import http from 'node:http';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { createHash, createHmac } from 'node:crypto';
import {
  DB_PATH,
  HOST,
  IS_PRODUCTION,
  OPS_TOKEN,
  PORT,
  PUBLIC_DIR,
  RECEIPT_SECRET,
  TRUST_PROXY,
} from './src/config.js';
import { createStore, openDatabase, StoreError } from './src/db.js';
import { createPostgresStore, openPostgresDatabase } from './src/postgres-db.js';
import { totalsFor } from './src/pricing.js';
import {
  isValidOrderRef,
  normalizeEmail,
  validateCustomer,
  validateLookup,
  validateQuantity,
} from './src/validation.js';
import {
  appendCookie,
  clientIp,
  createRateLimiter,
  isSameOrigin,
  newCsrfToken,
  newIdempotencyKey,
  parseCookies,
  randomToken,
  serializeCookie,
  signReceipt,
  timingSafeEqualText,
  verifyReceiptToken,
} from './src/security.js';
import { page } from './src/views/layout.js';
import { renderHome } from './src/views/home.js';
import { renderCart, renderCheckout } from './src/views/purchase.js';
import { renderReceipt, renderReceiptLocked } from './src/views/receipt.js';
import { renderLookup } from './src/views/lookup.js';
import { renderNotes } from './src/views/notes.js';
import { renderOps } from './src/views/ops.js';
import { renderErrorPage } from './src/views/error.js';

const CART_COOKIE = 'tt_cart';
const CSRF_COOKIE = 'tt_csrf';
const RECEIPT_COOKIE_PREFIX = 'tt_receipt_';
const SESSION_AGE_SECONDS = 60 * 60 * 24 * 30;
const JSON_LIMIT = 64 * 1024;
const FORM_LIMIT = 64 * 1024;
const IDEMPOTENCY_PATTERN = /^[A-Za-z0-9._:-]{8,100}$/;
const PUBLIC_ID_PATTERN = /^TT-[A-HJ-NP-Z2-9]{8}$/;

const MIME_TYPES = {
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
};

class HttpError extends Error {
  constructor(status, code, message, details = {}) {
    super(message);
    this.name = 'HttpError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

function setSecurityHeaders(res) {
  res.setHeader(
    'Content-Security-Policy',
    [
      "default-src 'self'",
      "base-uri 'none'",
      "connect-src 'self'",
      "font-src 'self'",
      "form-action 'self'",
      "frame-ancestors 'none'",
      "img-src 'self' data:",
      "object-src 'none'",
      "script-src 'self'",
      "style-src 'self'",
    ].join('; '),
  );
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
  res.setHeader('Permissions-Policy', 'camera=(), geolocation=(), microphone=(), payment=()');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
}

function sendHtml(res, status, html, headers = {}) {
  res.writeHead(status, {
    'Content-Type': 'text/html; charset=utf-8',
    'Cache-Control': 'no-store',
    ...headers,
  });
  res.end(html);
}

function sendJson(res, status, payload, headers = {}) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    ...headers,
  });
  res.end(JSON.stringify(payload));
}

function redirect(res, location, status = 303) {
  res.writeHead(status, {
    Location: location,
    'Cache-Control': 'no-store',
  });
  res.end();
}

function readBody(req, limit) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > limit) {
        reject(new HttpError(413, 'body_too_large', 'That request is too large.'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

async function parseJsonBody(req) {
  const contentType = String(req.headers['content-type'] || '');
  if (!contentType.includes('application/json')) {
    throw new HttpError(415, 'unsupported_media_type', 'Send this request as JSON.');
  }
  const body = await readBody(req, JSON_LIMIT);
  if (!body.length) throw new HttpError(400, 'empty_body', 'The request body is empty.');
  let parsed;
  try {
    parsed = JSON.parse(body.toString('utf8'));
  } catch {
    throw new HttpError(400, 'invalid_json', 'The request body is not valid JSON.');
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new HttpError(400, 'invalid_body', 'The request body must be an object.');
  }
  return parsed;
}

async function parseFormBody(req) {
  const contentType = String(req.headers['content-type'] || '');
  if (!contentType.includes('application/x-www-form-urlencoded')) {
    throw new HttpError(415, 'unsupported_media_type', 'Send this form as URL-encoded data.');
  }
  const body = await readBody(req, FORM_LIMIT);
  const params = new URLSearchParams(body.toString('utf8'));
  const result = Object.create(null);
  for (const [key, value] of params) result[key] = value;
  return result;
}

function ensureCsrf(req, res) {
  const cookies = parseCookies(req.headers.cookie);
  const existing = cookies[CSRF_COOKIE];
  if (existing && existing.length >= 16 && existing.length <= 128) return existing;
  const token = newCsrfToken();
  appendCookie(
    res,
    serializeCookie(CSRF_COOKIE, token, {
      maxAge: SESSION_AGE_SECONDS,
      secure: isSecureRequestForCookies(req),
    }),
  );
  return token;
}

function isSecureRequestForCookies(req) {
  if (req.socket?.encrypted) return true;
  if (TRUST_PROXY) {
    return String(req.headers['x-forwarded-proto'] || '').split(',')[0].trim() === 'https';
  }
  return false;
}

function verifyCsrf(req, provided) {
  const cookies = parseCookies(req.headers.cookie);
  const expected = cookies[CSRF_COOKIE];
  if (!expected || !provided || !timingSafeEqualText(expected, provided)) {
    throw new HttpError(403, 'csrf_failed', 'Your session expired. Reload the page and try again.');
  }
}

function cartCookie(req, res, cartId) {
  appendCookie(
    res,
    serializeCookie(CART_COOKIE, cartId, {
      maxAge: SESSION_AGE_SECONDS,
      secure: isSecureRequestForCookies(req),
    }),
  );
}

function clearCartCookie(req, res) {
  appendCookie(
    res,
    serializeCookie(CART_COOKIE, '', {
      maxAge: 0,
      secure: isSecureRequestForCookies(req),
    }),
  );
}

function receiptCookieName(publicId) {
  return `${RECEIPT_COOKIE_PREFIX}${publicId}`;
}

function receiptCookiePath(publicId) {
  return `/receipt/${publicId}`;
}

function setReceiptCookie(req, res, publicId, token) {
  appendCookie(
    res,
    serializeCookie(receiptCookieName(publicId), token, {
      path: receiptCookiePath(publicId),
      maxAge: SESSION_AGE_SECONDS,
      secure: isSecureRequestForCookies(req),
    }),
  );
}

function receiptTokenFromCookie(req, publicId) {
  const cookies = parseCookies(req.headers.cookie);
  return cookies[receiptCookieName(publicId)] || '';
}

function receiptUrl(publicId, token) {
  return `/receipt/${encodeURIComponent(publicId)}?key=${encodeURIComponent(token)}`;
}

function etagFor(cart) {
  return `"cart-${cart.id}-${cart.revision}"`;
}

function parseIfMatch(req) {
  const raw = req.headers['if-match'];
  if (!raw) return null;
  const match = /^\s*"cart-(.+)-(\d+)"\s*$/.exec(String(raw));
  if (!match) return null;
  return { cartId: match[1], revision: Number.parseInt(match[2], 10) };
}

function draftCart() {
  return {
    id: null,
    quantity: 0,
    revision: 0,
    status: 'draft',
    totals: totalsFor(0),
  };
}

// Only the browser gets the bearer token; SQLite stores its SHA-256 digest.
function guestId(req, issueTo = null) {
  let token = parseCookies(req.headers.cookie).tt_guest;
  if (!/^[A-Za-z0-9_-]{43}$/.test(token || '')) {
    if (!issueTo) return null;
    token = randomToken();
    appendCookie(issueTo, serializeCookie('tt_guest', token, {
      maxAge: SESSION_AGE_SECONDS, secure: isSecureRequestForCookies(req),
    }));
  }
  return createHash('sha256').update(token).digest('hex');
}

async function cartFromRequest(req, res, store, owner = guestId(req)) {
  const cookies = parseCookies(req.headers.cookie);
  const id = cookies[CART_COOKIE];
  if (!id) return null;
  const cart = await store.getCart(id, owner);
  if (!cart || cart.status !== 'active') {
    clearCartCookie(req, res);
    return null;
  }
  return cart;
}

function orderResponse(order) {
  const token = signReceipt(order.publicId, RECEIPT_SECRET);
  return {
    publicId: order.publicId,
    quantity: order.quantity,
    totalPaise: order.totalPaise,
    status: order.status,
    createdAt: order.createdAt,
    receiptUrl: receiptUrl(order.publicId, token),
  };
}

function checkRateLimit(limiter, req) {
  const result = limiter.check(clientIp(req, TRUST_PROXY));
  if (!result.allowed) {
    throw new HttpError(429, 'rate_limited', 'Too many attempts. Wait a moment and try again.', {
      retryAfter: result.retryAfterSeconds,
    });
  }
}

function requireOrigin(req) {
  if (!isSameOrigin(req)) {
    throw new HttpError(403, 'origin_failed', 'That request did not come from this shop.');
  }
}

function parseExpectedRevision(req, body = {}) {
  const fromHeader = parseIfMatch(req);
  if (fromHeader) return fromHeader;
  if (body.expectedRevision !== undefined && body.expectedRevision !== '') {
    const revision = Number.parseInt(String(body.expectedRevision), 10);
    if (Number.isInteger(revision) && revision >= 0) {
      return { cartId: body.cartId || null, revision };
    }
  }
  return null;
}

function idempotencyFrom(value) {
  const key = String(value || '').trim();
  return IDEMPOTENCY_PATTERN.test(key) ? key : '';
}

function guestKey(req, key) {
  const session = parseCookies(req.headers.cookie)[CSRF_COOKIE];
  return createHmac('sha256', RECEIPT_SECRET).update(`checkout:${session}:${key}`).digest('hex');
}

async function renderShopPage(req, res, store, screen, {
  status = 200,
  errors = {},
  values = {},
  notice = '',
  idempotencyKey = '',
} = {}) {
  const csrfToken = ensureCsrf(req, res);
  const owner = guestId(req, res);
  const previousId = parseCookies(req.headers.cookie)[CART_COOKIE];
  if (previousId) await store.bindLegacyCart(previousId, owner);
  let cart = await cartFromRequest(req, res, store, owner);
  if (!cart) {
    cart = await store.createCart(owner);
    cartCookie(req, res, cart.id);
  }
  const key = idempotencyFrom(idempotencyKey) || newIdempotencyKey();
  const renderer = { home: renderHome, cart: renderCart, checkout: renderCheckout }[screen];
  const view = renderer({
    cart,
    csrfToken,
    errors,
    values,
    notice,
    idempotencyKey: key,
  });
  sendHtml(res, status, page({
    title: screen === 'home' ? 'TrailTurn — a route your dog can feel' : `${screen === 'cart' ? 'Your cart' : 'Checkout'} · TrailTurn`,
    description: screen === 'home'
      ? 'TrailTurn is a concept floor toy that raises one paddle at a time, holds the route when a dog walks away, and resumes where it left off. Try two routes and place a demo guest order.'
      : 'Use the TrailTurn demo basket to place one guest order and open your receipt.',
    body: view.body,
    bodyClass: view.bodyClass,
    bodyData: view.bodyData,
    cartQuantity: cart.quantity,
    current: 'shop',
  }));
}

async function renderLookupPage(req, res, store, { status = 200, values = {}, errors = {}, notice = '' } = {}) {
  const csrfToken = ensureCsrf(req, res);
  const body = renderLookup({ csrfToken, values, errors, notice });
  sendHtml(res, status, page({
    title: 'Find your receipt · TrailTurn',
    description: 'Open a TrailTurn demo receipt with your order reference and the email used at checkout.',
    body,
    bodyClass: 'page-lookup',
    noindex: true,
  }));
}

function storeErrorToApi(error) {
  if (error instanceof StoreError) {
    if (error.code === 'EMPTY_CART') return { status: 422, payload: { code: 'empty_cart', message: error.message } };
    if (error.code === 'CART_CONFLICT') {
      return {
        status: 409,
        payload: {
          code: 'cart_conflict',
          message: 'This cart changed somewhere else. Review the current total and try again.',
          cart: error.details.cart,
          etag: error.details.cart ? etagFor(error.details.cart) : null,
        },
      };
    }
    if (error.code === 'CART_COMPLETED') {
      return {
        status: 409,
        payload: {
          code: 'cart_completed',
          message: 'This cart has already been ordered.',
          cart: error.details.cart || null,
          order: error.details.order ? orderResponse(error.details.order) : null,
        },
      };
    }
    if (error.code === 'IDEMPOTENCY_CONFLICT') {
      return {
        status: 409,
        payload: {
          code: 'idempotency_conflict',
          message: 'That request key was already used for another cart.',
        },
      };
    }
    if (error.code === 'CART_NOT_FOUND') {
      return {
        status: 404,
        payload: { code: 'cart_not_found', message: error.message },
      };
    }
    if (error.code === 'ORDER_CREATE_FAILED') {
      return {
        status: 500,
        payload: { code: 'order_create_failed', message: 'The order could not be created. Try again.' },
      };
    }
  }
  return null;
}

function storeErrorToNotice(error) {
  if (!(error instanceof StoreError)) return '';
  if (error.code === 'EMPTY_CART') return error.message;
  if (error.code === 'CART_CONFLICT') {
    return 'This cart changed somewhere else. We refreshed the total. Review it and place the order again.';
  }
  if (error.code === 'CART_COMPLETED') {
    return 'This cart has already been ordered. Start a new cart below, or find the existing receipt with the order reference and email.';
  }
  if (error.code === 'CART_NOT_FOUND') {
    return 'That cart expired. Review the current total and try again.';
  }
  if (error.code === 'IDEMPOTENCY_CONFLICT') {
    return 'That checkout attempt was already used. Start a fresh attempt below.';
  }
  return '';
}

async function serveStatic(req, res, pathname) {
  let filePath;
  if (pathname === '/styles.css') filePath = path.join(PUBLIC_DIR, 'styles.css');
  else if (pathname === '/app.js') filePath = path.join(PUBLIC_DIR, 'app.js');
  else if (pathname === '/favicon.svg') filePath = path.join(PUBLIC_DIR, 'favicon.svg');
  else if (pathname === '/robots.txt') filePath = path.join(PUBLIC_DIR, 'robots.txt');
  else if (pathname.startsWith('/assets/')) {
    const name = pathname.slice('/assets/'.length);
    if (!/^[A-Za-z0-9._-]+$/.test(name)) return false;
    filePath = path.join(PUBLIC_DIR, 'assets', name);
  } else if (pathname.startsWith('/fonts/')) {
    const name = pathname.slice('/fonts/'.length);
    if (!/^[A-Za-z0-9._-]+$/.test(name)) return false;
    filePath = path.join(PUBLIC_DIR, 'fonts', name);
  } else {
    return false;
  }

  const resolved = path.resolve(filePath);
  if (!resolved.startsWith(`${path.resolve(PUBLIC_DIR)}${path.sep}`)) return false;

  let stat;
  try {
    stat = await fsp.stat(resolved);
  } catch {
    return false;
  }
  if (!stat.isFile()) return false;

  const extension = path.extname(resolved).toLowerCase();
  const contentType = MIME_TYPES[extension] || 'application/octet-stream';
  const cacheControl = IS_PRODUCTION ? 'public, max-age=86400' : 'no-cache';
  res.writeHead(200, {
    'Content-Type': contentType,
    'Content-Length': stat.size,
    'Cache-Control': cacheControl,
  });
  if (req.method === 'HEAD') {
    res.end();
    return true;
  }
  fs.createReadStream(resolved).pipe(res);
  return true;
}

export function createApp({
  dbPath = DB_PATH,
  logger = console,
  opsToken = OPS_TOKEN,
} = {}) {
  const connectionString =
    process.env.DATABASE_URL ||
    process.env.POSTGRES_URL ||
    process.env.POSTGRES_PRISMA_URL;
  let db;
  let store;
  let ready = Promise.resolve();
  if (connectionString) {
    db = openPostgresDatabase(connectionString);
    store = createPostgresStore(db);
    ready = db.ready;
  } else {
    db = openDatabase(dbPath);
    store = createStore(db);
  }

  const orderLimiter = createRateLimiter({ windowMs: 60_000, max: 8 });
  const lookupLimiter = createRateLimiter({ windowMs: 60_000, max: 12 });
  const opsLimiter = createRateLimiter({ windowMs: 60_000, max: 20 });

  const server = http.createServer(async (req, res) => {
    const started = performance.now();
    const requestId = cryptoRandomId();
    res.setHeader('X-Request-Id', requestId);
    setSecurityHeaders(res);

    let pathnameForLog = '/';
    try {
      const host = req.headers.host || 'localhost';
      let url;
      try {
        url = new URL(req.url || '/', `http://${host}`);
      } catch {
        throw new HttpError(400, 'bad_request', 'That request could not be read.');
      }

      let pathname;
      try {
        pathname = decodeURIComponent(url.pathname);
      } catch {
        throw new HttpError(400, 'bad_path', 'That path could not be read.');
      }
      pathnameForLog = pathname;
      const path = pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname;
      const method = req.method || 'GET';

      if ((method === 'GET' || method === 'HEAD') && (await serveStatic(req, res, path))) {
        return;
      }

      if (path === '/healthz' && method === 'GET') {
        let ok = false;
        try {
          ok = await store.health();
        } catch {
          ok = false;
        }
        sendJson(res, ok ? 200 : 503, {
          ok,
          service: 'trailturn',
          time: new Date().toISOString(),
        });
        return;
      }

      if (path === '/robots.txt' && method === 'GET') {
        sendHtml(res, 200, 'User-agent: *\nDisallow: /receipt\nDisallow: /ops\nDisallow: /api/\n', {
          'Content-Type': 'text/plain; charset=utf-8',
        });
        return;
      }

      if (['/', '/cart', '/checkout'].includes(path) && method === 'GET') {
        await renderShopPage(req, res, store, path === '/' ? 'home' : path.slice(1));
        return;
      }

      if (path === '/notes' && method === 'GET') {
        const html = page({
          title: 'Demo & research notes · TrailTurn',
          description:
            'The product finding, demo assumptions, engineering decisions, and references behind the TrailTurn concept shop.',
          body: renderNotes(),
          bodyClass: 'page-notes',
          current: 'notes',
        });
        sendHtml(res, 200, html);
        return;
      }

      if (path === '/api/cart' && method === 'GET') {
        const cart = await cartFromRequest(req, res, store);
        if (!cart) {
          const draft = draftCart();
          sendJson(res, 200, { cart: draft, etag: '"cart-new-0"' }, { ETag: '"cart-new-0"' });
          return;
        }
        const etag = etagFor(cart);
        sendJson(res, 200, { cart, etag }, { ETag: etag });
        return;
      }

      if (path === '/cart' && method === 'POST') {
        requireOrigin(req);
        const form = await parseFormBody(req);
        verifyCsrf(req, form.csrf);
        const check = validateQuantity(form.quantity);
        const cart = await cartFromRequest(req, res, store);
        if (!cart || cart.id !== form.cartId || cart.revision !== Number(form.revision) || !check.ok) {
          await renderShopPage(req, res, store, 'cart', { status: check.ok ? 409 : 422, notice: check.message || 'Review the current basket quantity and try again.' });
          return;
        }
        await store.updateCartQuantity({ cartId: cart.id, guestId: guestId(req), expectedRevision: cart.revision, quantity: check.quantity });
        redirect(res, '/cart');
        return;
      }

      if (path === '/api/cart' && method === 'PUT') {
        requireOrigin(req);
        const body = await parseJsonBody(req);
        verifyCsrf(req, req.headers['x-csrf-token'] || body.csrf);
        if (!guestId(req)) throw new HttpError(403, 'session_required', 'Reload the shop to open your basket.');
        const quantityCheck = validateQuantity(body.quantity);
        if (!quantityCheck.ok) {
          sendJson(res, 422, { code: 'invalid_quantity', errors: { quantity: quantityCheck.message } });
          return;
        }

        const expected = parseExpectedRevision(req, body);
        if (!expected) {
          sendJson(res, 428, { code: 'precondition_required', message: 'Send If-Match with the cart revision.' });
          return;
        }

        const cookies = parseCookies(req.headers.cookie);
        const cookieCartId = cookies[CART_COOKIE] || null;

        if (cookieCartId && expected.cartId && expected.cartId !== 'new' && expected.cartId !== cookieCartId) {
          const current = await store.getCart(cookieCartId, guestId(req));
          sendJson(
            res,
            409,
            {
              code: 'cart_conflict',
              message: 'This cart changed somewhere else. Review the current total and try again.',
              cart: current,
              etag: current ? etagFor(current) : null,
            },
            current ? { ETag: etagFor(current) } : {},
          );
          return;
        }

        if (!cookieCartId && expected.revision !== 0) {
          const draft = draftCart();
          sendJson(res, 409, {
            code: 'cart_conflict',
            message: 'That cart expired. Review the current total and try again.',
            cart: draft,
            etag: '"cart-new-0"',
          });
          return;
        }

        try {
          const cart = await store.updateCartQuantity({
            cartId: cookieCartId,
            guestId: guestId(req),
            expectedRevision: expected.revision,
            quantity: quantityCheck.quantity,
          });
          if (!cookieCartId) cartCookie(req, res, cart.id);
          const etag = etagFor(cart);
          sendJson(res, 200, { cart, etag }, { ETag: etag });
        } catch (error) {
          const mapped = storeErrorToApi(error);
          if (!mapped) throw error;
          sendJson(res, mapped.status, mapped.payload, mapped.payload.etag ? { ETag: mapped.payload.etag } : {});
        }
        return;
      }

      if (path === '/api/orders/status' && method === 'POST') {
        requireOrigin(req);
        checkRateLimit(lookupLimiter, req);
        const body = await parseJsonBody(req);
        verifyCsrf(req, req.headers['x-csrf-token']);
        const key = idempotencyFrom(body.idempotencyKey);
        if (!key || typeof body.cartId !== 'string' || !body.cartId) {
          throw new HttpError(400, 'invalid_attempt', 'A checkout attempt is required.');
        }
        const order = await store.getOrderByIdempotencyKey(guestKey(req, key), guestId(req));
        // The cart cookie may already have been cleared by a successful commit.
        // A matching guest-scoped attempt and original cart authorize recovery.
        sendJson(res, 200, { order: order && order.cartId === body.cartId ? orderResponse(order) : null });
        return;
      }

      if (path === '/api/orders' && method === 'POST') {
        requireOrigin(req);
        const body = await parseJsonBody(req);
        verifyCsrf(req, req.headers['x-csrf-token'] || body.csrf);

        const customerCheck = validateCustomer(body.customer || {});
        if (!customerCheck.ok) {
          sendJson(res, 422, {
            code: 'validation_failed',
            message: 'Check the highlighted delivery details.',
            errors: customerCheck.errors,
          });
          return;
        }

        checkRateLimit(orderLimiter, req);
        const rawKey = idempotencyFrom(body.idempotencyKey);
        if (!rawKey) {
          sendJson(res, 422, {
            code: 'invalid_idempotency_key',
            message: 'A valid idempotency key is required.',
            errors: { idempotencyKey: 'A valid request key is required.' },
          });
          return;
        }

        const expected = parseExpectedRevision(req, body);
        if (!expected) {
          sendJson(res, 428, { code: 'precondition_required', message: 'Send If-Match with the cart revision.' });
          return;
        }

        const cookies = parseCookies(req.headers.cookie);
        const cookieCartId = cookies[CART_COOKIE] || null;
        const requestedCartId = body.cartId ? String(body.cartId) : null;
        const key = guestKey(req, rawKey);
        const replay = requestedCartId ? await store.getOrderByIdempotencyKey(key, guestId(req)) : null;
        const authorizedReplay = !cookieCartId && replay && replay.cartId === requestedCartId;

        // A cart belongs to the browser that holds its HttpOnly cookie. A request
        // may not name a different cart, even if it knows the identifier. The one
        // exception is an idempotent replay: the unguessable request key proves
        // that this caller already placed the order.
        if (requestedCartId && requestedCartId !== cookieCartId && !authorizedReplay) {
          const current = cookieCartId ? await store.getCart(cookieCartId, guestId(req)) : null;
          sendJson(
            res,
            409,
            {
              code: 'cart_conflict',
              message: 'This cart changed somewhere else. Review the current total and try again.',
              cart: current,
              etag: current ? etagFor(current) : null,
            },
            current ? { ETag: etagFor(current) } : {},
          );
          return;
        }

        const cartId = cookieCartId || (authorizedReplay ? requestedCartId : null);

        if (expected.cartId && expected.cartId !== 'new' && expected.cartId !== cartId) {
          sendJson(res, 409, {
            code: 'cart_conflict',
            message: 'This cart changed somewhere else. Review the current total and try again.',
          });
          return;
        }

        try {
          const result = await store.placeOrder({
            cartId,
            guestId: guestId(req),
            expectedRevision: expected.revision,
            idempotencyKey: key,
            customer: customerCheck.values,
          });
          const response = orderResponse(result.order);
          setReceiptCookie(req, res, result.order.publicId, signReceipt(result.order.publicId, RECEIPT_SECRET));
          clearCartCookie(req, res);
          sendJson(res, result.replay ? 200 : 201, { order: response, replay: Boolean(result.replay) }, {
            Location: response.receiptUrl,
          });
        } catch (error) {
          const mapped = storeErrorToApi(error);
          if (!mapped) throw error;
          sendJson(res, mapped.status, mapped.payload);
        }
        return;
      }

      if (path === '/checkout' && method === 'POST') {
        requireOrigin(req);
        const form = await parseFormBody(req);
        verifyCsrf(req, form.csrf);
        const customerCheck = validateCustomer(form);

        if (!customerCheck.ok) {
          await renderShopPage(req, res, store, 'checkout', {
            status: 422,
            errors: customerCheck.errors,
            values: customerCheck.values,
            idempotencyKey: idempotencyFrom(form.idempotencyKey),
          });
          return;
        }

        checkRateLimit(orderLimiter, req);
        const rawKey = idempotencyFrom(form.idempotencyKey);
        if (!rawKey) throw new HttpError(400, 'missing_key', 'Reload checkout before placing this order.');
        const key = guestKey(req, rawKey);
        const cookies = parseCookies(req.headers.cookie);
        const cookieCartId = cookies[CART_COOKIE] || null;
        const requestedCartId = String(form.cartId || '') || null;

        const replay = requestedCartId && !cookieCartId ? await store.getOrderByIdempotencyKey(key, guestId(req)) : null;
        if (requestedCartId && requestedCartId !== cookieCartId && replay?.cartId !== requestedCartId) {
          await renderShopPage(req, res, store, 'checkout', {
            status: 409,
            values: customerCheck.values,
            notice: 'This cart changed somewhere else. Review the current total and try again.',
            idempotencyKey: rawKey,
          });
          return;
        }

        const cartId = cookieCartId || requestedCartId;
        const expectedRevision = Number.parseInt(String(form.revision || '0'), 10);

        try {
          const result = await store.placeOrder({
            cartId,
            guestId: guestId(req),
            expectedRevision: Number.isInteger(expectedRevision) ? expectedRevision : 0,
            idempotencyKey: key,
            customer: customerCheck.values,
          });
          const token = signReceipt(result.order.publicId, RECEIPT_SECRET);
          setReceiptCookie(req, res, result.order.publicId, token);
          clearCartCookie(req, res);
          redirect(res, receiptUrl(result.order.publicId, token));
        } catch (error) {
          if (error instanceof StoreError && error.code === 'CART_COMPLETED' && error.details.order) {
            const token = signReceipt(error.details.order.publicId, RECEIPT_SECRET);
            setReceiptCookie(req, res, error.details.order.publicId, token);
            clearCartCookie(req, res);
            redirect(res, receiptUrl(error.details.order.publicId, token));
            return;
          }
          const mapped = storeErrorToApi(error);
          if (!mapped) throw error;
          await renderShopPage(req, res, store, 'checkout', {
            status: mapped.status,
            values: customerCheck.values,
            notice: storeErrorToNotice(error),
            idempotencyKey: newIdempotencyKey(),
          });
        }
        return;
      }

      if (path === '/receipt' && method === 'GET') {
        await renderLookupPage(req, res, store);
        return;
      }

      if (path === '/receipt/lookup' && method === 'POST') {
        requireOrigin(req);
        checkRateLimit(lookupLimiter, req);
        const form = await parseFormBody(req);
        verifyCsrf(req, form.csrf);
        const lookupCheck = validateLookup(form);
        if (!lookupCheck.ok) {
          await renderLookupPage(req, res, store, {
            status: 422,
            values: lookupCheck.values,
            errors: lookupCheck.errors,
          });
          return;
        }

        const order = await store.findOrderForLookup(lookupCheck.values.orderRef, normalizeEmail(lookupCheck.values.email));
        if (!order) {
          await renderLookupPage(req, res, store, {
            status: 404,
            values: lookupCheck.values,
            notice: "We couldn't find a receipt with those details. Check the reference and email, then try again.",
          });
          return;
        }

        const token = signReceipt(order.publicId, RECEIPT_SECRET);
        setReceiptCookie(req, res, order.publicId, token);
        redirect(res, `/receipt/${order.publicId}`);
        return;
      }

      const receiptMatch = /^\/receipt\/([A-Za-z0-9-]+)$/.exec(path);
      if (receiptMatch && method === 'GET') {
        const publicId = receiptMatch[1].toUpperCase();
        res.setHeader('Referrer-Policy', 'no-referrer');
        res.setHeader('X-Robots-Tag', 'noindex, nofollow');

        if (!PUBLIC_ID_PATTERN.test(publicId)) {
          sendHtml(res, 404, renderReceiptLocked());
          return;
        }

        const queryKey = url.searchParams.get('key') || '';
        if (queryKey) {
          if (verifyReceiptToken(publicId, queryKey, RECEIPT_SECRET)) {
            setReceiptCookie(req, res, publicId, queryKey);
            redirect(res, `/receipt/${publicId}`);
            return;
          }
          sendHtml(res, 404, renderReceiptLocked());
          return;
        }

        const cookieToken = receiptTokenFromCookie(req, publicId);
        if (!cookieToken || !verifyReceiptToken(publicId, cookieToken, RECEIPT_SECRET)) {
          sendHtml(res, 404, renderReceiptLocked());
          return;
        }

        const order = await store.getOrderByPublicId(publicId);
        if (!order) {
          sendHtml(res, 404, renderReceiptLocked());
          return;
        }

        sendHtml(res, 200, renderReceipt({ order }));
        return;
      }

      if (path === '/ops' && method === 'GET') {
        if (!opsToken) {
          sendHtml(res, 404, renderErrorPage({ status: 404, title: 'Not found', message: 'That page is not here.' }));
          return;
        }
        const csrfToken = ensureCsrf(req, res);
        sendHtml(res, 200, renderOps({ csrfToken }));
        return;
      }

      if (path === '/ops' && method === 'POST') {
        if (!opsToken) {
          sendHtml(res, 404, renderErrorPage({ status: 404, title: 'Not found', message: 'That page is not here.' }));
          return;
        }
        requireOrigin(req);
        checkRateLimit(opsLimiter, req);
        const form = await parseFormBody(req);
        verifyCsrf(req, form.csrf);
        if (!timingSafeEqualText(String(form.token || ''), opsToken)) {
          sendHtml(res, 404, renderErrorPage({ status: 404, title: 'Not found', message: 'That page is not here.' }));
          return;
        }
        const orderRef = String(form.orderRef || '').toUpperCase();
        if (!isValidOrderRef(orderRef)) {
          const csrfToken = ensureCsrf(req, res);
          sendHtml(res, 200, renderOps({
            csrfToken,
            token: String(form.token || ''),
            orderRef,
            error: 'Enter a valid order reference, like TT-7K4M9P2Q.',
          }));
          return;
        }
        const result = await store.opsSearch(orderRef);
        const csrfToken = ensureCsrf(req, res);
        sendHtml(res, 200, renderOps({
          csrfToken,
          token: String(form.token || ''),
          orderRef,
          result,
          searched: true,
        }));
        return;
      }

      if (path.startsWith('/api/')) {
        sendJson(res, 404, { code: 'not_found', message: 'That API route does not exist.' });
        return;
      }

      sendHtml(res, 404, renderErrorPage({
        status: 404,
        title: 'This route is not here.',
        message: 'The page may have moved, or the link may be incomplete. The shop and the receipt lookup are still open.',
      }));
    } catch (error) {
      const elapsed = Math.round(performance.now() - started);
      if (res.headersSent) {
        try {
          res.end();
        } catch {
          // Ignore a socket that already closed.
        }
      } else if (error instanceof HttpError) {
        if (error.status === 429 && error.details.retryAfter) {
          res.setHeader('Retry-After', String(error.details.retryAfter));
        }
        if (pathnameForLog.startsWith('/api/')) {
          sendJson(res, error.status, { code: error.code, message: error.message });
        } else {
          sendHtml(res, error.status, renderErrorPage({
            status: error.status,
            title: error.status === 403 ? 'That request needs a fresh page.' : 'Something went wrong.',
            message: error.message,
          }));
        }
      } else {
        logger.error?.(`[trailturn] ${requestId} ${req.method} ${pathnameForLog} failed after ${elapsed}ms`);
        logger.error?.(error?.stack || error?.message || error);
        if (pathnameForLog.startsWith('/api/')) {
          sendJson(res, 500, { code: 'internal_error', message: 'Something went wrong on our side.' });
        } else {
          sendHtml(res, 500, renderErrorPage({
            status: 500,
            title: 'Something went wrong.',
            message: 'The shop hit an unexpected error. Try again, or return to the home page.',
          }));
        }
      }
      return;
    } finally {
      const elapsed = Math.round(performance.now() - started);
      logger.info?.(`[trailturn] ${req.method} ${pathnameForLog} ${res.statusCode} ${elapsed}ms ${requestId}`);
    }
  });

  server.on('close', () => {
    try {
      db.close();
    } catch {
      // The database may already be closed.
    }
  });

  return { server, store, db, ready };
}

function cryptoRandomId() {
  return globalThis.crypto?.randomUUID?.() || Math.random().toString(36).slice(2);
}

const isMain = process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url;

if (isMain) {
  const { server } = createApp();
  server.listen(PORT, HOST, () => {
    console.log(`[trailturn] listening on http://${HOST}:${PORT}`);
    console.log('[trailturn] demo checkout is non-charging; no payment is collected.');
  });

  const shutdown = () => {
    console.log('[trailturn] shutting down');
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 5_000).unref();
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}
