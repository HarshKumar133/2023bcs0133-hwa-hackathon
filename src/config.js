import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

export const ROOT = path.resolve(import.meta.dirname, '..');
export const PUBLIC_DIR = path.join(ROOT, 'public');
export const DATA_DIR = path.resolve(
  process.env.DATA_DIR ||
  (process.env.VERCEL ? '/tmp/trailturn-data' : path.join(ROOT, 'data')),
);
export const DB_PATH = path.resolve(process.env.DB_PATH || path.join(DATA_DIR, 'trailturn.db'));
export const PORT = Number.parseInt(process.env.PORT || '3000', 10);
export const HOST = process.env.HOST || '127.0.0.1';
export const IS_PRODUCTION = process.env.NODE_ENV === 'production';
export const TRUST_PROXY = process.env.TRUST_PROXY === '1';

fs.mkdirSync(DATA_DIR, { recursive: true });

function readOrCreateReceiptSecret() {
  const fromEnv = (process.env.RECEIPT_SECRET || '').trim();
  if (fromEnv.length >= 32) return fromEnv;

  const secretPath = path.join(DATA_DIR, '.receipt-secret');
  try {
    const stored = fs.readFileSync(secretPath, 'utf8').trim();
    if (stored.length >= 32) return stored;
  } catch {
    // First run.
  }

  const secret = crypto.randomBytes(32).toString('hex');
  fs.writeFileSync(secretPath, `${secret}\n`, { mode: 0o600 });
  return secret;
}

export const RECEIPT_SECRET = readOrCreateReceiptSecret();
export const OPS_TOKEN = (process.env.OPS_TOKEN || '').trim();
