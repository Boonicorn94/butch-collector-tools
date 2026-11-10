import { timingSafeEqual } from 'node:crypto';
import { clearSession, isAuthorized, isConfigured, issueSession, sameOrigin } from '../lib/session.js';

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  res.setHeader('Vary', 'Cookie');
  if (req.method === 'GET') {
    if (!isConfigured()) return res.status(503).json({ ok: false, configured: false, error: 'App access protection is not configured yet.' });
    return res.status(200).json({ ok: isAuthorized(req), configured: true });
  }
  if (req.method === 'DELETE') {
    clearSession(res);
    return res.status(200).json({ ok: true });
  }
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'GET, POST, DELETE');
    return res.status(405).json({ error: 'Method not allowed' });
  }
  if (!sameOrigin(req)) return res.status(403).json({ error: 'Request origin not allowed' });
  if (!isConfigured()) return res.status(503).json({ error: 'Set PSA_ACCESS_PASSWORD and PSA_SESSION_SECRET in Vercel first.' });

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    const supplied = Buffer.from(String(body?.password || ''));
    const expected = Buffer.from(process.env.PSA_ACCESS_PASSWORD);
    if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) {
      return res.status(401).json({ error: 'Incorrect password. Try again.' });
    }
    issueSession(res);
    return res.status(200).json({ ok: true });
  } catch {
    return res.status(400).json({ error: 'Invalid login request' });
  }
}
