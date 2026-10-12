import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { cfg } from '../config';

// TOTP по RFC 6238 (SHA-1, 6 цифр, шаг 30 секунд) — совместимо с Google Authenticator, Aegis и др.

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

export function base32Encode(buf: Buffer): string {
  let bits = 0;
  let value = 0;
  let out = '';
  for (const byte of buf) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += ALPHABET[(value << (5 - bits)) & 31];
  return out;
}

export function base32Decode(s: string): Buffer {
  const clean = s.replace(/=+$/, '').replace(/\s/g, '').toUpperCase();
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const ch of clean) {
    const idx = ALPHABET.indexOf(ch);
    if (idx < 0) throw new Error('Неверный символ base32');
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

export function generateSecret(): string {
  return base32Encode(randomBytes(20));
}

export function totpAt(secret: string, counter: number): string {
  const msg = Buffer.alloc(8);
  msg.writeBigUInt64BE(BigInt(counter));
  const h = createHmac('sha1', base32Decode(secret)).update(msg).digest();
  const offset = h[h.length - 1] & 0x0f;
  const code = ((h.readUInt32BE(offset) & 0x7fffffff) % 1_000_000).toString();
  return code.padStart(6, '0');
}

/** Проверка кода с допуском ±1 шаг (рассинхронизация часов до 30 секунд) */
export function verifyTotp(secret: string, code: string, now = Date.now()): boolean {
  if (!/^\d{6}$/.test(code)) return false;
  const counter = Math.floor(now / 30_000);
  for (const d of [-1, 0, 1]) {
    const expected = Buffer.from(totpAt(secret, counter + d));
    if (timingSafeEqual(expected, Buffer.from(code))) return true;
  }
  return false;
}

export function otpauthUrl(secret: string, email: string) {
  const label = encodeURIComponent(`AIN Cloud:${email}`);
  return `otpauth://totp/${label}?secret=${secret}&issuer=${encodeURIComponent('AIN Cloud')}&algorithm=SHA1&digits=6&period=30`;
}

// ---------- хранение секрета ----------

const key = () => createHash('sha256').update(`${cfg.appSecret}:totp`).digest();

export function encryptSecret(secret: string): string {
  const iv = randomBytes(12);
  const c = createCipheriv('aes-256-gcm', key(), iv);
  const enc = Buffer.concat([c.update(secret, 'utf8'), c.final()]);
  return `${iv.toString('base64url')}.${c.getAuthTag().toString('base64url')}.${enc.toString('base64url')}`;
}

export function decryptSecret(stored: string): string {
  const [iv, tag, enc] = stored.split('.').map((x) => Buffer.from(x, 'base64url'));
  const d = createDecipheriv('aes-256-gcm', key(), iv);
  d.setAuthTag(tag);
  return Buffer.concat([d.update(enc), d.final()]).toString('utf8');
}

// ---------- промежуточный токен входа (пароль проверен, ждём второй фактор) ----------

const MFA_TTL_MS = 5 * 60_000;

export function mfaToken(userId: string): string {
  const exp = Date.now() + MFA_TTL_MS;
  const sig = createHmac('sha256', cfg.appSecret).update(`mfa.${userId}.${exp}`).digest('base64url');
  return `${userId}.${exp}.${sig}`;
}

export function readMfaToken(token: string): string | null {
  const [userId, exp, sig] = token.split('.');
  if (!userId || !exp || !sig || Number(exp) < Date.now()) return null;
  const expected = Buffer.from(createHmac('sha256', cfg.appSecret).update(`mfa.${userId}.${exp}`).digest('base64url'));
  const got = Buffer.from(sig);
  return expected.length === got.length && timingSafeEqual(expected, got) ? userId : null;
}
