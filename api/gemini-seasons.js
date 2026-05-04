export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { title, originalTitle } = req.body;
  if (!title) return res.status(400).json({ error: 'Title required' });

  const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
  if (!GEMINI_API_KEY) return res.status(500).json({ error: 'GEMINI_API_KEY not set' });

  const contextHint = originalTitle && originalTitle !== title
    ? `The user searched for "${originalTitle}" which is part of the "${title}" series.`
    : '';

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{
            parts: [{
              text: `Search the internet and find ALL TV seasons of the anime series "${title}".
${contextHint}

CRITICAL RULES:
1. "${title}" is the BASE series name - find ALL its seasons from Season 1 onwards
2. Do NOT treat it as a single season - find the complete series
3. Return ALL main TV seasons in order (Season 1, 2, 3, 4...)
4. Each season should have its own entry with correct episode count
5. Search for latest accurate episode counts online

Return ONLY this JSON (no markdown):
{
  "seriesName": "Clean English base name e.g. Re:Zero",
  "seasons": [
    { "num": 1, "title": "Re:Zero -Starting Life in Another World-", "episodes": 25, "isAiring": false, "latestEpisode": 25 },
    { "num": 2, "title": "Re:Zero -Starting Life in Another World- Season 2", "episodes": 26, "isAiring": false, "latestEpisode": 26 },
    { "num": 3, "title": "Re:Zero -Starting Life in Another World- Season 3", "episodes": 25, "isAiring": false, "latestEpisode": 25 }
  ]
}

Rules:
- Only TV seasons (no movies/OVA/specials)
- episodes = total for finished, latest aired for ongoing
- isAiring = true only if currently airing right now
- title = exact MAL title for each season
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
    if (!parsed.seriesName || !Array.isArray(parsed.seasons))
      return res.status(500).json({ error: 'Invalid Gemini response' });

    // Jikan se har season ka malId + image lo
    const now = Date.now();
    for (let i = 0; i < parsed.seasons.length; i++) {
      const s = parsed.seasons[i];
      if (i > 0) await new Promise(r => setTimeout(r, 350));
      try {
        const jRes = await fetch(
          `https://api.jikan.moe/v4/anime?q=${encodeURIComponent(s.title)}&type=tv&limit=5&sfw`
        );
        const jData = await jRes.json();
        if (jData.data?.length > 0) {
          const lq   = s.title.toLowerCase();
          const best = jData.data.find(a =>
            (a.title||'').toLowerCase() === lq ||
            (a.title_english||'').toLowerCase() === lq
          ) || jData.data[0];
          parsed.seasons[i].malId = best.mal_id;
          parsed.seasons[i].image = best.images?.jpg?.image_url || '';
        }
      } catch(e) { console.warn('Jikan image failed:', s.title); }
      parsed.seasons[i].watchedEpisodes = 0;
      parsed.seasons[i].episodesLastUpdated = now;
    }

    return res.status(200).json(parsed);
  } catch(err) {
    console.error('gemini-seasons error:', err);
    return res.status(500).json({ error: err.message });
  }
}
