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

  const list = seasons.map(s => `Season ${s.num}: "${s.title}"`).join('\n');

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{
            parts: [{
              text: `Search the internet for the latest episode information for these anime seasons:

${list}

Return ONLY this JSON, no markdown:
{
  "results": [
    {
      "num": 1,
      "episodes": 1159,
      "isAiring": true,
      "latestEpisode": 1159
    }
  ]
}

Rules:
- Search internet for current accurate data
- episodes = total if finished, latest aired number if ongoing
- isAiring = true if currently airing
- NEVER return 0 for popular anime
- Return ONLY raw JSON`
            }]
          }],
          tools: [{ google_search: {} }]
        })
      }
    );

    const data = await response.json();
    if (data.error) return res.status(400).json({ error: data.error.message });

    let raw = data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || '';
    raw = raw.replace(/^```json\s*/i,'').replace(/^```\s*/i,'').replace(/\s*```$/i,'').trim();
    const match = raw.match(/\{[\s\S]*\}/);
    if (match) raw = match[0];

    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed.results))
      return res.status(500).json({ error: 'Invalid response' });

    return res.status(200).json(parsed);
  } catch(err) {
    console.error('gemini-episodes error:', err);
    return res.status(500).json({ error: err.message });
  }
}
