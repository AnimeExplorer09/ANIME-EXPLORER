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

  const prompt = `Search the internet and find complete information about the anime "${title}".

Find ALL separate TV seasons on MyAnimeList and their CURRENT episode counts.

Return ONLY this exact JSON (no markdown, no explanation, just raw JSON):
{
  "seriesName": "Clean English series name",
  "seasons": [
    {
      "num": 1,
      "query": "Exact Japanese romanized title as on MAL",
      "episodes": 1159,
      "isAiring": true,
      "latestEpisode": 1159
    }
  ]
}

STRICT RULES:
- Only main TV series (NO Movies, OVAs, Specials)
- seriesName = clean English title
- query = exact MAL search title (Japanese romanized)
- episodes = REAL current episode count. Search the internet to get accurate number. NEVER use 0
- For One Piece: episodes is 1000+, currently airing
- For long-running single-entry anime (One Piece, Naruto, Bleach) that are NOT split into multiple seasons on MAL: return exactly 1 item
- isAiring = true only if actively airing new episodes right now in 2025/2026
- latestEpisode = latest actually aired episode number
- Return ONLY raw JSON, nothing else`;

  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`;
    
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        tools: [{ google_search: {} }],  // ← Real-time internet search
        generationConfig: { temperature: 0.1, maxOutputTokens: 1024 }
      })
    });

    const data = await response.json();
    
    if (data.error) {
      console.error('Gemini seasons error:', data.error);
      // Fallback without search
      return await fallbackSeasons(res, title, GEMINI_API_KEY, prompt);
    }

    let raw = data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || '';
    raw = raw.replace(/^```json\s*/i,'').replace(/^```\s*/i,'').replace(/\s*```$/i,'').trim();
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (jsonMatch) raw = jsonMatch[0];

    const parsed = JSON.parse(raw);
    if (!parsed.seriesName || !Array.isArray(parsed.seasons) || parsed.seasons.length === 0)
      return res.status(500).json({ error: 'Invalid Gemini response' });

    console.log('Gemini seasons result:', JSON.stringify(parsed));
    return res.status(200).json(parsed);

  } catch (err) {
    console.error('gemini-seasons error:', err);
    return await fallbackSeasons(res, title, GEMINI_API_KEY, prompt);
  }
}

async function fallbackSeasons(res, title, apiKey, prompt) {
  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.1, maxOutputTokens: 1024 }
      })
    });
    const data = await response.json();
    let raw = data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || '';
    raw = raw.replace(/^```json\s*/i,'').replace(/^```\s*/i,'').replace(/\s*```$/i,'').trim();
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (jsonMatch) raw = jsonMatch[0];
    const parsed = JSON.parse(raw);
    return res.status(200).json(parsed);
  } catch(e) {
    return res.status(500).json({ error: 'Gemini fallback failed: ' + e.message });
  }
}
