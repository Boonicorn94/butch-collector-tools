export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }
  if (!process.env.OPENAI_API_KEY) {
    return res.status(503).json({ error: 'AI grading is not configured yet. Add OPENAI_API_KEY to the Vercel environment variables.' });
  }
  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    const { frontImage, backImage } = body || {};
    const validImage = value => typeof value === 'string' &&
      /^data:image\/(jpeg|png|webp);base64,/.test(value) && value.length < 2500000;
    if (!validImage(frontImage) || !validImage(backImage)) {
      return res.status(400).json({ error: 'Upload clear front and back photos (each under 2.5 MB after compression).' });
    }
    const prompt = `You are a cautious trading-card condition assessment assistant. Assess only visible condition from the provided FRONT and BACK photographs. You cannot authenticate the card or issue an official grade. Estimate PSA 1-10 likelihood conservatively; do not assume a 10 because the card looks clean. Consider centering, corners, edges and surface. Account for photo limitations. If the image is blurry, angled, sleeved, shadowed or incomplete, lower confidence and say so. Return ONLY valid JSON with these keys: estimatedGrade (string such as "8–9 / 10" or "Not enough evidence"), verdict (short string), centering (short string), corners (short string), edges (short string), surface (short string), findings (2-5 concise sentences), confidence ("Low", "Medium", or "High"). Never say authentic/legit or guarantee PSA 10. If authenticity is in question, explicitly say photos cannot confirm it.`;
    const upstream = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + process.env.OPENAI_API_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'gpt-4.1-mini',
        temperature: 0.2,
        response_format: { type: 'json_object' },
        messages: [{ role: 'user', content: [
          { type: 'text', text: prompt },
          { type: 'text', text: 'FRONT PHOTO:' },
          { type: 'image_url', image_url: { url: frontImage, detail: 'high' } },
          { type: 'text', text: 'BACK PHOTO:' },
          { type: 'image_url', image_url: { url: backImage, detail: 'high' } }
        ] }]
      })
    });
    const result = await upstream.json();
    if (!upstream.ok) {
      console.error('OpenAI grading error:', result);
      return res.status(502).json({ error: 'The AI scan could not be completed. Check the API key and billing, then try again.' });
    }
    const raw = result.choices?.[0]?.message?.content;
    if (!raw) throw new Error('Empty AI response');
    const grade = JSON.parse(raw);
    return res.status(200).json({
      estimatedGrade: String(grade.estimatedGrade || 'Not enough evidence').slice(0, 80),
      verdict: String(grade.verdict || 'Visual estimate only').slice(0, 180),
      centering: String(grade.centering || 'Not clear').slice(0, 180),
      corners: String(grade.corners || 'Not clear').slice(0, 180),
      edges: String(grade.edges || 'Not clear').slice(0, 180),
      surface: String(grade.surface || 'Not clear').slice(0, 180),
      findings: String(grade.findings || 'Insufficient visible detail.').slice(0, 1200),
      confidence: String(grade.confidence || 'Low').slice(0, 20)
    });
  } catch (error) {
    console.error('AI grading API error:', error);
    return res.status(500).json({ error: 'Something went wrong during the card scan. Please try again.' });
  }
}