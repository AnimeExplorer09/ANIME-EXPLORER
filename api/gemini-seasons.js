export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    const { title, malId } = req.body;
  if (!title) return res.status(400).json({ error: 'Title required' });


  const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
  if (!GEMINI_API_KEY) return res.status(500).json({ error: 'GEMINI_API_KEY not set' });

  /* ════════════════════════════════════════════════════
     STEP 1: AniList → Main anime + ALL related entries
     (relations include sequels, prequels, side stories etc.)
     Also fetches episode count + airing status per entry
  ════════════════════════════════════════════════════ */
    let aniListData = null;
  try {
    const aniQuery = `
      query ($idMal: Int) {
        Media(idMal: $idMal, type: ANIME) {
          title { romaji english }
          episodes
          status
          format
          nextAiringEpisode { episode }
          airingSchedule(notYetAired: false, perPage: 1, sort: TIME_DESC) {
            nodes { episode }
          }
          relations {
            edges {
              relationType
              node {
                title { romaji english }
                episodes
                status
                format
                nextAiringEpisode { episode }
                airingSchedule(notYetAired: false, perPage: 1, sort: TIME_DESC) {
                  nodes { episode }
                }
              }
            }
          }
        }
      }`;

    const aRes = await fetch('https://graphql.anilist.co', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: JSON.stringify({ query: aniQuery, variables: { idMal: parseInt(malId) } })
    });

    const aData = await aRes.json();
    if (aData?.data?.Media) aniListData = aData.data.Media;
  } catch(e) {
    console.warn('AniList fetch failed:', e.message);
  }

  /* ════════════════════════════════════════════════════
     STEP 2: Build candidate list for Gemini to analyze
     Main anime + all TV/ONA relations
  ════════════════════════════════════════════════════ */
  let candidates = [];

  if (aniListData) {
    // Add main anime
    candidates.push({
      title:   aniListData.title.romaji || aniListData.title.english,
      english: aniListData.title.english || '',
      format:  'TV',
      status:  aniListData.status,
      episodes: getEpisodeCount(aniListData),
      isAiring: aniListData.status === 'RELEASING',
      latestEpisode: getLatestEpisode(aniListData)
    });

    // Add related entries (sequels, side stories etc.)
    for (const edge of (aniListData.relations?.edges || [])) {
      const node = edge.node;
      const fmt  = node.format;
      // Only include TV/ONA — skip movies, music, specials
      if (!['TV','ONA'].includes(fmt)) continue;
      candidates.push({
        title:        node.title.romaji || node.title.english,
        english:      node.title.english || '',
        relationType: edge.relationType,
        format:       fmt,
        status:       node.status,
        episodes:     getEpisodeCount(node),
        isAiring:     node.status === 'RELEASING',
        latestEpisode: getLatestEpisode(node)
      });
    }
  }

  /* ════════════════════════════════════════════════════
     STEP 3: Gemini → Filter & sort which are real seasons
     (removes filler entries, sorts by season number)
  ════════════════════════════════════════════════════ */
  const candidateList = candidates.length > 0
    ? candidates.map((c,i) => `${i+1}. "${c.title}" (${c.english}) - format:${c.format}, relation:${c.relationType||'MAIN'}, episodes:${c.episodes}`).join('\n')
    : `Just the anime: "${title}"`;

  const geminiPrompt = `You are a MyAnimeList anime expert.

The user searched for: "${title}"

Here are candidate anime entries from AniList:
${candidateList}

Task: Identify which entries are the MAIN TV SEASONS of "${title}" in chronological order.

Return ONLY this raw JSON:
{
  "seriesName": "Clean English series name",
  "seasons": [
    { "num": 1, "query": "Exact title for season 1" },
    { "num": 2, "query": "Exact title for season 2" }
  ]
}

Rules:
- Only include main TV seasons (not movies, OVAs, specials, recap series)
- query = the romaji/Japanese title from the list above
- If the anime is a single long-running series (One Piece, Naruto) → return just 1 item
- Order seasons chronologically (season 1 first)
- Return ONLY raw JSON, nothing else`;

  let geminiSeasons = null;
  try {
    const gRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: geminiPrompt }] }],
          generationConfig: { temperature: 0, maxOutputTokens: 512 }
        })
      }
    );
    const gData = await gRes.json();
    if (gData.error) throw new Error(gData.error.message);

    let raw = gData?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || '';
    raw = raw.replace(/^```json\s*/i,'').replace(/^```\s*/i,'').replace(/\s*```$/i,'').trim();
    const match = raw.match(/\{[\s\S]*\}/);
    if (match) raw = match[0];
    geminiSeasons = JSON.parse(raw);
  } catch(e) {
    console.error('Gemini error:', e.message);
    // Fallback: use main title as single season
    geminiSeasons = {
      seriesName: title,
      seasons: [{ num: 1, query: title }]
    };
  }

  /* ════════════════════════════════════════════════════
     STEP 4: Build final seasons array
     Match Gemini's season list with AniList episode data
     + Jikan for malId and cover image
  ════════════════════════════════════════════════════ */
  const finalSeasons = [];
  const now = Date.now();

  for (let i = 0; i < geminiSeasons.seasons.length; i++) {
    const s = geminiSeasons.seasons[i];
    if (i > 0) await new Promise(r => setTimeout(r, 350));

    // Match with AniList candidates to get episode data
    const aniMatch = candidates.find(c =>
      c.title.toLowerCase() === s.query.toLowerCase() ||
      c.english?.toLowerCase() === s.query.toLowerCase() ||
      c.title.toLowerCase().includes(s.query.toLowerCase()) ||
      s.query.toLowerCase().includes(c.title.toLowerCase())
    );

    let episodes      = aniMatch?.episodes      || 0;
    let isAiring      = aniMatch?.isAiring      || false;
    let latestEpisode = aniMatch?.latestEpisode || episodes;
    let malId         = null;
    let image         = '';

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

        malId = best.mal_id;
        image = best.images?.jpg?.image_url || '';

        // If AniList gave no episode count, try Jikan (works for finished anime)
        if (episodes === 0 && best.episodes) {
          episodes      = best.episodes;
          latestEpisode = best.episodes;
          isAiring      = best.airing || false;
        }
      }
    } catch(e) { console.warn('Jikan failed for:', s.query); }

    finalSeasons.push({
      num:             s.num,
      malId:           malId,
      title:           s.query,
      episodes:        episodes,
      isAiring:        isAiring,
      latestEpisode:   latestEpisode,
      watchedEpisodes: 0,
      image:           image,
      episodesLastUpdated: now
    });
  }

  return res.status(200).json({
    seriesName: geminiSeasons.seriesName,
    seasons:    finalSeasons
  });
}

/* ── Helpers to get episode count from AniList node ── */
function getEpisodeCount(media) {
  if (media.status === 'FINISHED' && media.episodes) return media.episodes;
  if (media.status === 'RELEASING') {
    if (media.nextAiringEpisode?.episode)
      return media.nextAiringEpisode.episode - 1;
    if (media.airingSchedule?.nodes?.[0]?.episode)
      return media.airingSchedule.nodes[0].episode;
    if (media.episodes) return media.episodes;
  }
  return media.episodes || 0;
}

function getLatestEpisode(media) {
  if (media.status === 'RELEASING') {
    if (media.nextAiringEpisode?.episode)
      return media.nextAiringEpisode.episode - 1;
    if (media.airingSchedule?.nodes?.[0]?.episode)
      return media.airingSchedule.nodes[0].episode;
  }
  return media.episodes || 0;
}
