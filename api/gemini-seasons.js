export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { title } = req.body;
  if (!title) return res.status(400).json({ error: 'Title required' });

  const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
  if (!GEMINI_API_KEY) return res.status(500).json({ error: 'GEMINI_API_KEY not set' });

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{
            parts: [{
              text: `Search the internet and find all TV seasons of the anime "${title}".

Return ONLY this JSON, no markdown, no extra text:
{
  "seriesName": "English series name",
  "seasons": [
    {
      "num": 1,
      "title": "Exact season title",
      "episodes": 25,
      "isAiring": false,
      "latestEpisode": 25
    }
  ]
}

Rules:
- Search internet for latest accurate info
- Only main TV seasons (no movies, OVAs, specials)
- episodes = total if finished, latest aired number if ongoing
- isAiring = true if currently airing new episodes
- For single long-running anime (One Piece, Naruto) return 1 season with current episode count
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
      return res.status(500).json({ error: 'Invalid response from Gemini' });

    // Jikan se sirf malId + image lo
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
