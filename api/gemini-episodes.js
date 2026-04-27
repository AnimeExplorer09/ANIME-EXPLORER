export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { seasons } = req.body;
  if (!Array.isArray(seasons) || seasons.length === 0)
    return res.status(400).json({ error: 'seasons array required' });

  const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
  if (!GEMINI_API_KEY) return res.status(500).json({ error: 'GEMINI_API_KEY not set' });

  const list = seasons.map(s =>
    `Season ${s.num}: "${s.title}" (currently airing: ${s.isAiring ? 'yes' : 'unknown'})`
  ).join('\n');

  const prompt = `You are an anime database expert with up-to-date 2025/2026 knowledge.

For each anime season below, give the LATEST accurate information:

${list}

Return ONLY this exact JSON (no markdown, nothing else):
{
  "results": [
    {
      "num": 1,
      "episodes": 25,
      "isAiring": false,
      "latestEpisode": 25
    }
  ]
}

Rules:
- num = same as input season number
- episodes = total episode count (best current estimate, NEVER 0 unless truly unknown)
- isAiring = true if actively broadcasting new episodes right now in 2025/2026
- latestEpisode = latest episode that has actually aired (if finished same as episodes)
- Return ONLY raw JSON`;

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
      return res.status(500).json({ error: 'Invalid response' });

    return res.status(200).json(parsed);
  } catch (err) {
    console.error('gemini-episodes error:', err);
    return res.status(500).json({ error: err.message });
  }
}
