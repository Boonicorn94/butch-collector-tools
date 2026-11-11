import { list, put } from '@vercel/blob';

const KEY = 'shared/cards.json';
const empty = { cards: [], wishlist: [] };

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(204).end();

  try {
    if (req.method === 'GET') {
      const found = await list({ prefix: KEY, limit: 1 });
      if (!found.blobs.length) return res.status(200).json(empty);
      const response = await fetch(found.blobs[0].downloadUrl, { cache: 'no-store' });
      if (!response.ok) throw new Error('Could not read shared cards');
      const data = await response.json();
      return res.status(200).json({ cards: Array.isArray(data.cards) ? data.cards : [], wishlist: Array.isArray(data.wishlist) ? data.wishlist : [] });
    }

    if (req.method === 'POST') {
      const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
      if (!body || !Array.isArray(body.cards) || body.cards.length > 500 || (body.wishlist != null && (!Array.isArray(body.wishlist) || body.wishlist.length > 500))) {
        return res.status(400).json({ error: 'Invalid cards payload' });
      }
      const cards = body.cards;\n      let wishlist = Array.isArray(body.wishlist) ? body.wishlist : [];
      const valid = cards.every(c =>
        c && typeof c.id === 'string' &&
        typeof c.name === 'string' && c.name.length <= 120 &&
        Number.isFinite(Number(c.raw)) && Number(c.raw) > 0 &&
        Number.isFinite(Number(c.psa10)) && Number(c.psa10) >= 0 &&
        (c.imageUrl == null || (typeof c.imageUrl === 'string' && c.imageUrl.length <= 1500000))
      );
      if (!valid) return res.status(400).json({ error: 'One or more cards are invalid' });\n      const validWishlist = wishlist.every(w => w && typeof w.id === 'string' && typeof w.name === 'string' && w.name.length <= 120 && (w.set == null || (typeof w.set === 'string' && w.set.length <= 120)) && (w.targetPrice == null || w.targetPrice === '' || (Number.isFinite(Number(w.targetPrice)) && Number(w.targetPrice) >= 0)));\n      if (!validWishlist) return res.status(400).json({ error: 'One or more wishlist items are invalid' });

      await put(KEY, JSON.stringify({ cards, wishlist }), {
        access: 'public',
        addRandomSuffix: false,
        allowOverwrite: true,
        contentType: 'application/json',
        cacheControlMaxAge: 0
      });
      return res.status(200).json({ ok: true, count: cards.length });
    }

    res.setHeader('Allow', 'GET, POST, OPTIONS');
    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error) {
    console.error('Shared card API error:', error);
    return res.status(500).json({ error: 'Shared storage is not configured or is temporarily unavailable' });
  }
}
