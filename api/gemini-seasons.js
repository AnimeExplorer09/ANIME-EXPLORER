export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { title } = req.body;
  if (!title) return res.status(400).json({ error: 'Title is required' });

  const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
  if (!GEMINI_API_KEY) return res.status(500).json({ error: 'GEMINI_API_KEY not configured' });

  const prompt = `You are a MyAnimeList anime database expert with complete up-to-date knowledge.

For the anime titled "${title}", find ALL separate TV seasons on MyAnimeList.

Return ONLY this exact JSON (no markdown, no explanation):
{
  "seriesName": "Clean English series name e.g. Attack on Titan",
  "seasons": [
    {
      "num": 1,
      "query": "Exact MAL Japanese romanized title for searching",
      "episodes": 25,
      "isAiring": false,
      "latestEpisode": 25
    },
    {
      "num": 2,
      "query": "Exact MAL title for season 2",
      "episodes": 12,
      "isAiring": true,
      "latestEpisode": 8
    }
  ]
}

Rules:
- Only main TV series (NO Movies, OVAs, Specials)
- seriesName = clean English title
- query = Japanese romanized title exactly as on MAL (for image/ID lookup)
- episodes = total episode count (best estimate if not finalized, 0 only if truly unknown)
- isAiring = true if this season is currently broadcasting right now
- latestEpisode = latest episode that has actually aired (if finished, same as episodes)
- For single-entry long-running anime (Naruto, One Piece) return 1 item only
- Return ONLY raw JSON, nothing else`;

  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`;
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.1, maxOutputTokens: 1024 }
      })
    });

    const data = await response.json();
    if (data.error) return res.status(400).json({ error: `Gemini: ${data.error.message}` });

    let raw = data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || '';
    raw = raw.replace(/^```json\s*/i,'').replace(/^```\s*/i,'').replace(/\s*```$/i,'').trim();

    const parsed = JSON.parse(raw);
    if (!parsed.seriesName || !Array.isArray(parsed.seasons)) {
      return res.status(500).json({ error: 'Invalid Gemini response structure' });
    }
    return res.status(200).json(parsed);
  } catch (err) {
    console.error('gemini-seasons error:', err);
    return res.status(500).json({ error: err.message });
  }
}
