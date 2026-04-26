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

  const prompt = `You are a MyAnimeList (MAL) anime database expert.

For the anime titled "${title}", find ALL separate TV seasons that exist as individual entries on MyAnimeList.

Return ONLY this exact JSON (no markdown fences, no explanation, nothing else):
{
  "seriesName": "Clean English series name e.g. Attack on Titan",
  "seasons": [
    { "query": "Exact search keyword for season 1 on MAL", "num": 1 },
    { "query": "Exact search keyword for season 2 on MAL", "num": 2 }
  ]
}

Rules:
- Only include main TV series entries (NO Movies, OVAs, Specials, Music)
- Use the Japanese romanized title exactly as it appears on MAL for the query field
- seriesName must be clean English
- For long-running single-entry anime (Naruto, One Piece, Bleach) NOT split into numbered seasons on MAL return just 1 item
- Return ONLY the raw JSON object, nothing else`;

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

    let rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || '';
    rawText = rawText.replace(/^```json\s*/i,'').replace(/^```\s*/i,'').replace(/\s*```$/i,'').trim();

    const parsed = JSON.parse(rawText);
    if (!parsed.seriesName || !Array.isArray(parsed.seasons)) {
      return res.status(500).json({ error: 'Invalid Gemini response structure' });
    }
    return res.status(200).json(parsed);
  } catch (err) {
    console.error('gemini-seasons error:', err);
    return res.status(500).json({ error: err.message });
  }
}
