import { createHmac, timingSafeEqual } from 'node:crypto';

const COOKIE = 'psa_session';
const MAX_AGE = 60 * 60 * 24 * 7;

function configured() {
  return Boolean(
    process.env.PSA_ACCESS_PASSWORD &&
    process.env.PSA_ACCESS_PASSWORD.length >= 12 &&
    process.env.PSA_SESSION_SECRET &&
    process.env.PSA_SESSION_SECRET.length >= 32
  );
}

function signature(value) {
  return createHmac('sha256', process.env.PSA_SESSION_SECRET).update(value).digest('base64url');
}

export function issueSession(res) {
  const expires = Math.floor(Date.now() / 1000) + MAX_AGE;
  const payload = String(expires);
  const token = payload + '.' + signature(payload);
  res.setHeader('Set-Cookie', `${COOKIE}=${token}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${MAX_AGE}`);
}

export function clearSession(res) {
  res.setHeader('Set-Cookie', `${COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0`);
}

export function isAuthorized(req) {
  if (!configured()) return false;
  const cookie = String(req.headers.cookie || '').split(';').map(x => x.trim()).find(x => x.startsWith(COOKIE + '='));
  if (!cookie) return false;
  const token = cookie.slice(COOKIE.length + 1);
  const parts = token.split('.');
  if (parts.length !== 2 || !/^\d+$/.test(parts[0])) return false;
  const expected = Buffer.from(signature(parts[0]));
  const actual = Buffer.from(parts[1]);
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return false;
  return Number(parts[0]) > Math.floor(Date.now() / 1000);
}

export function isConfigured() {
  return configured();
}

export function sameOrigin(req) {
  const origin = req.headers.origin;
  const host = req.headers.host;
  return !origin || (host && new URL(origin).host === host);
}
