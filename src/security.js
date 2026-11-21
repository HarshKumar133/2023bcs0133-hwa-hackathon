import crypto from 'node:crypto';

const HTML_ESCAPES = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

export function escapeHtml(value = '') {
  return String(value).replace(/[&<>"']/g, (character) => HTML_ESCAPES[character]);
}

export const escapeAttr = escapeHtml;

export function safeJsonForHtml(value) {
  return JSON.stringify(value).replace(/[<>&\u2028\u2029]/g, (character) => {
    const code = character.charCodeAt(0).toString(16).padStart(4, '0');
    return `\\u${code}`;
  });
}

export function randomToken(bytes = 32) {
  return crypto.randomBytes(bytes).toString('base64url');
}

export function parseCookies(header = '') {
  const cookies = Object.create(null);
  for (const part of String(header).split(';')) {
    const index = part.indexOf('=');
    if (index === -1) continue;
    const name = part.slice(0, index).trim();
    if (!name) continue;
    const raw = part.slice(index + 1).trim();
    try {
      cookies[name] = decodeURIComponent(raw);
    } catch {
      cookies[name] = raw;
    }
  }
  return cookies;
}

export function serializeCookie(name, value, options = {}) {
  const parts = [`${name}=${encodeURIComponent(value)}`];
  parts.push(`Path=${options.path || '/'}`);
  if (options.maxAge !== undefined) parts.push(`Max-Age=${Math.floor(options.maxAge)}`);
  if (options.expires) parts.push(`Expires=${options.expires.toUTCString()}`);
  parts.push(`SameSite=${options.sameSite || 'Lax'}`);
  if (options.httpOnly !== false) parts.push('HttpOnly');
  if (options.secure) parts.push('Secure');
  return parts.join('; ');
}

export function appendCookie(res, cookie) {
  const existing = res.getHeader('Set-Cookie');
  if (!existing) {
    res.setHeader('Set-Cookie', cookie);
  } else if (Array.isArray(existing)) {
    res.setHeader('Set-Cookie', [...existing, cookie]);
  } else {
    res.setHeader('Set-Cookie', [existing, cookie]);
  }
}

export function isSecureRequest(req) {
  if (req.socket && req.socket.encrypted) return true;
  if (process.env.TRUST_PROXY === '1') {
    return String(req.headers['x-forwarded-proto'] || '').split(',')[0].trim() === 'https';
  }
  return false;
}

export function timingSafeEqualText(left, right) {
  const a = Buffer.from(String(left));
  const b = Buffer.from(String(right));
  if (a.length !== b.length) {
    // Compare a same-length dummy so the failure path still does work.
    crypto.timingSafeEqual(a, Buffer.alloc(a.length));
    return false;
  }
  return crypto.timingSafeEqual(a, b);
}

export function signReceipt(publicId, secret) {
  const signature = crypto.createHmac('sha256', secret).update(`receipt:${publicId}`).digest('base64url');
  return `v1.${signature}`;
}

export function verifyReceiptToken(publicId, token, secret) {
  if (typeof token !== 'string' || !token.startsWith('v1.')) return false;
  const expected = signReceipt(publicId, secret);
  return timingSafeEqualText(token, expected);
}

const PUBLIC_ID_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export function generatePublicId(prefix = 'TT-') {
  const bytes = crypto.randomBytes(8);
  let output = '';
  for (let index = 0; index < 8; index += 1) {
    output += PUBLIC_ID_ALPHABET[bytes[index] % PUBLIC_ID_ALPHABET.length];
  }
  return `${prefix}${output}`;
}

export function newIdempotencyKey() {
  return crypto.randomUUID();
}

export function newCsrfToken() {
  return randomToken(24);
}

export function clientIp(req, trustProxy = false) {
  if (trustProxy) {
    const forwarded = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
    if (forwarded) return forwarded;
  }
  return req.socket?.remoteAddress || 'unknown';
}

export function createRateLimiter({ windowMs = 60_000, max = 10, maxKeys = 2_000 } = {}) {
  const buckets = new Map();

  function prune(now) {
    if (buckets.size <= maxKeys) return;
    for (const [key, bucket] of buckets) {
      if (bucket.resetAt <= now) buckets.delete(key);
    }
    while (buckets.size > maxKeys) {
      const oldest = buckets.keys().next().value;
      buckets.delete(oldest);
    }
  }

  return {
    check(key) {
      const now = Date.now();
      prune(now);
      let bucket = buckets.get(key);
      if (!bucket || bucket.resetAt <= now) {
        bucket = { count: 0, resetAt: now + windowMs };
        buckets.set(key, bucket);
      }
      bucket.count += 1;
      const allowed = bucket.count <= max;
      return {
        allowed,
        remaining: Math.max(0, max - bucket.count),
        retryAfterSeconds: allowed ? 0 : Math.max(1, Math.ceil((bucket.resetAt - now) / 1000)),
      };
    },
    reset() {
      buckets.clear();
    },
  };
}

export function isSameOrigin(req) {
  const origin = req.headers.origin;
  if (!origin) return true;
  const forwardedHost = process.env.TRUST_PROXY === '1' ? req.headers['x-forwarded-host'] : '';
  const host = String(forwardedHost || req.headers.host || '');
  if (!host) return false;
  const protocol = isSecureRequest(req) ? 'https' : 'http';
  try {
    const parsed = new URL(origin);
    return parsed.protocol === `${protocol}:` && parsed.host === host;
  } catch {
    return false;
  }
}
