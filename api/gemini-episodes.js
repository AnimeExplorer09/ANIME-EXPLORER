export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { seasons } = req.body;
  // seasons = [{ num, title, malId }, ...]
  if (!Array.isArray(seasons) || seasons.length === 0)
    return res.status(400).json({ error: 'seasons array required' });

  const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
  if (!GEMINI_API_KEY) return res.status(500).json({ error: 'GEMINI_API_KEY not set' });

  const list = seasons.map(s => `Season ${s.num}: "${s.title}"`).join('\n');

  const prompt = `You are a MyAnimeList anime database expert.

For each anime season listed below, tell me the EXACT total episode count as listed on MyAnimeList.
If a season is currently airing and episode count is not finalized, give your best estimate.

${list}

Return ONLY this exact JSON (no markdown, no explanation):
{
  "results": [
    { "num": 1, "episodes": 13 },
    { "num": 2, "episodes": 25 }
  ]
}

Rules:
- "num" must match the season number given
- "episodes" must be a positive integer
- If truly unknown, use 0
- Return ONLY the raw JSON, nothing else`;

  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`;
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.1, maxOutputTokens: 512 }
      })
    });

    const data = await response.json();
    if (data.error) return res.status(400).json({ error: data.error.message });

    let raw = data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || '';
    raw = raw.replace(/^```json\s*/i,'').replace(/^```\s*/i,'').replace(/\s*```$/i,'').trim();

    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed.results))
      return res.status(500).json({ error: 'Invalid Gemini response' });

    return res.status(200).json(parsed);
  } catch (err) {
    console.error('gemini-episodes error:', err);
    return res.status(500).json({ error: err.message });
  }
}
