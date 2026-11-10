import { list, put } from '@vercel/blob';
import { isAuthorized, sameOrigin } from '../lib/session.js';

const KEY = 'shared/cards.json';
const empty = { cards: [] };

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  res.setHeader('Vary', 'Cookie');

  if (req.method === 'OPTIONS') {
    if (!sameOrigin(req)) return res.status(403).end();
    return res.status(204).end();
  }
  if (!['GET', 'POST'].includes(req.method)) {
    res.setHeader('Allow', 'GET, POST, OPTIONS');
    return res.status(405).json({ error: 'Method not allowed' });
  }
  if (!isAuthorized(req)) return res.status(401).json({ error: 'Please sign in to access the shared collection.' });
  if (req.method === 'POST' && !sameOrigin(req)) return res.status(403).json({ error: 'Request origin not allowed' });
  if (req.method === 'POST' && Number(req.headers['content-length'] || 0) > 8000000) {
    return res.status(413).json({ error: 'Card update is too large.' });
  }

  try {
    if (req.method === 'GET') {
      const found = await list({ prefix: KEY, limit: 1 });
      if (!found.blobs.length) return res.status(200).json(empty);
      const response = await fetch(found.blobs[0].downloadUrl, { cache: 'no-store' });
      if (!response.ok) throw new Error('Could not read shared cards');
      const data = await response.json();
      return res.status(200).json({ cards: Array.isArray(data.cards) ? data.cards : [] });
    }

    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    if (!body || !Array.isArray(body.cards) || body.cards.length > 500) {
      return res.status(400).json({ error: 'Invalid cards payload' });
    }
    const cards = body.cards;
    const valid = cards.every(c =>
      c && typeof c.id === 'string' && c.id.length <= 160 &&
      typeof c.name === 'string' && c.name.length <= 120 &&
      (c.set == null || (typeof c.set === 'string' && c.set.length <= 120)) &&
      Number.isFinite(Number(c.raw)) && Number(c.raw) > 0 &&
      Number.isFinite(Number(c.psa10)) && Number(c.psa10) >= 0 &&
      (c.imageUrl == null || (typeof c.imageUrl === 'string' && c.imageUrl.length <= 1500000))
    );
    if (!valid) return res.status(400).json({ error: 'One or more cards are invalid' });

    await put(KEY, JSON.stringify({ cards }), {
      access: 'public',
      addRandomSuffix: false,
      allowOverwrite: true,
      contentType: 'application/json',
      cacheControlMaxAge: 0
    });
    return res.status(200).json({ ok: true, count: cards.length });
  } catch (error) {
    console.error('Shared card API error:', error);
    return res.status(500).json({ error: 'Shared storage is not configured or is temporarily unavailable' });
  }
}
