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

  // ── STEP 1: Gemini → season names list ──
  const prompt = `You are a MyAnimeList expert. For the anime "${title}", list all separate TV seasons on MyAnimeList.

Return ONLY this raw JSON (no markdown):
{
  "seriesName": "Clean English series name",
  "seasons": [
    { "num": 1, "query": "Exact MAL Japanese romanized title" }
  ]
}

Rules:
- Only TV series (no movies/OVA/specials)
- query = exact title as it appears on MAL
- For long-running single-entry anime (One Piece, Naruto, Bleach, Dragon Ball Z) return just 1 item
- Return ONLY raw JSON, nothing else`;

  let seasonsFromGemini = null;
  try {
    const gRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0, maxOutputTokens: 512 }
        })
      }
    );
    const gData = await gRes.json();
    let raw = gData?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || '';
    raw = raw.replace(/^```json\s*/i,'').replace(/^```\s*/i,'').replace(/\s*```$/i,'').trim();
    const match = raw.match(/\{[\s\S]*\}/);
    if (match) raw = match[0];
    seasonsFromGemini = JSON.parse(raw);
  } catch(e) {
    console.error('Gemini error:', e);
    return res.status(500).json({ error: 'Gemini failed: ' + e.message });
  }

  if (!seasonsFromGemini?.seriesName || !Array.isArray(seasonsFromGemini.seasons)) {
    return res.status(500).json({ error: 'Invalid Gemini response' });
  }

  // ── STEP 2: For each season → Jikan (malId+image) + AniList (episodes) ──
  const finalSeasons = [];

  for (let i = 0; i < seasonsFromGemini.seasons.length; i++) {
    const s = seasonsFromGemini.seasons[i];
    if (i > 0) await new Promise(r => setTimeout(r, 350));

    let malId   = null;
    let image   = '';
    let episodes = 0;
    let isAiring = false;
    let latestEpisode = 0;

    // Jikan → malId + image
    try {
      const jRes  = await fetch(
        `https://api.jikan.moe/v4/anime?q=${encodeURIComponent(s.query)}&type=tv&limit=5&sfw`
      );
      const jData = await jRes.json();
      if (jData.data?.length > 0) {
        const lq   = s.query.toLowerCase();
        const best = jData.data.find(a =>
          (a.title||'').toLowerCase() === lq ||
          (a.title_english||'').toLowerCase() === lq
        ) || jData.data[0];

        malId    = best.mal_id;
        image    = best.images?.jpg?.image_url || '';
        isAiring = best.airing || false;

        // Jikan episodes (works for finished anime)
        if (best.episodes && best.episodes > 0) {
          episodes      = best.episodes;
          latestEpisode = best.episodes;
        }
      }
    } catch(e) { console.warn('Jikan failed for:', s.query); }

    // AniList → exact current episode (works for ONGOING anime)
    // Overrides Jikan episode count with real-time data
    try {
      const aniQuery = `{
        Media(search: ${JSON.stringify(s.query)}, type: ANIME, format_in: [TV]) {
          episodes
          status
          nextAiringEpisode { episode }
          airingSchedule(notYetAired: false, perPage: 1, sort: TIME_DESC) {
            nodes { episode }
          }
        }
      }`;

      const aRes = await fetch('https://graphql.anilist.co', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        body: JSON.stringify({ query: aniQuery })
      });
      const aData = await aRes.json();
      const media = aData?.data?.Media;

      if (media) {
        const status = media.status; // FINISHED, RELEASING, NOT_YET_RELEASED

        if (status === 'FINISHED' && media.episodes) {
          // Finished anime — use total episodes
          episodes      = media.episodes;
          latestEpisode = media.episodes;
          isAiring      = false;
        } else if (status === 'RELEASING') {
          isAiring = true;
          // Latest aired = nextAiring.episode - 1
          if (media.nextAiringEpisode?.episode) {
            latestEpisode = media.nextAiringEpisode.episode - 1;
            episodes      = latestEpisode; // current count
          }
          // Or from airing schedule
          else if (media.airingSchedule?.nodes?.[0]?.episode) {
            latestEpisode = media.airingSchedule.nodes[0].episode;
            episodes      = latestEpisode;
          }
          // Fallback: AniList total if set
          else if (media.episodes) {
            episodes      = media.episodes;
            latestEpisode = media.episodes;
          }
        }
      }
    } catch(e) { console.warn('AniList failed for:', s.query); }

    finalSeasons.push({
      num:           s.num,
      malId:         malId,
      title:         s.query,
      episodes:      episodes,
      isAiring:      isAiring,
      latestEpisode: latestEpisode,
      watchedEpisodes: 0,
      image:         image,
      episodesLastUpdated: Date.now()
    });
  }

  return res.status(200).json({
    seriesName: seasonsFromGemini.seriesName,
    seasons:    finalSeasons
  });
}
