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

  const prompt = `You are a MyAnimeList anime database expert with complete and up-to-date knowledge.

For the anime titled "${title}", list ALL separate TV seasons that exist as entries on MyAnimeList.

Return ONLY this exact JSON (no markdown, no explanation, just raw JSON):
{
  "seriesName": "Clean English series name e.g. Attack on Titan",
  "seasons": [
    {
      "num": 1,
      "query": "Exact Japanese romanized title as on MAL for image search",
      "episodes": 25,
      "isAiring": false,
      "latestEpisode": 25
    }
  ]
}

IMPORTANT RULES:
- Include ONLY main TV series (absolutely NO Movies, OVAs, Specials, Music)
- seriesName = clean English (not romanized Japanese)
- query = exact Japanese romanized title as it appears on MyAnimeList
- episodes = total episode count. For ongoing use your best current estimate. NEVER use 0 unless truly unknown
- isAiring = true ONLY if this season is actively broadcasting NEW episodes right now in 2025/2026
- latestEpisode = latest episode number that has actually aired. If finished same as episodes
- For long-running single-entry anime like One Piece, Naruto, Bleach that are NOT split into numbered seasons on MAL: return exactly 1 entry with current episode count
- Return ONLY the raw JSON object, nothing else at all`;

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
    if (!parsed.seriesName || !Array.isArray(parsed.seasons) || parsed.seasons.length === 0)
      return res.status(500).json({ error: 'Invalid Gemini response' });

    return res.status(200).json(parsed);
  } catch (err) {
    console.error('gemini-seasons error:', err);
    return res.status(500).json({ error: err.message });
  }
}
