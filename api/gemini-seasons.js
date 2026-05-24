export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  // ── malId bhi ab accept karo (anchor ke liye) ──
  const { title, originalTitle, malId: knownMalId } = req.body;
  if (!title) return res.status(400).json({ error: 'Title required' });

  const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
  if (!GEMINI_API_KEY) return res.status(500).json({ error: 'GEMINI_API_KEY not set' });

  const contextHint = originalTitle && originalTitle !== title
    ? `The user searched for "${originalTitle}" which is part of the "${title}" series.`
    : '';

  // ── Helper: title similarity (0.0 – 1.0) ──
  // Exact match → 1.0, partial/word-overlap → 0.x, no match → 0.0
  function titleSimilarity(a, b) {
    if (!a || !b) return 0;
    a = a.toLowerCase().replace(/[^\w\s]/g, '').trim();
    b = b.toLowerCase().replace(/[^\w\s]/g, '').trim();
    if (a === b) return 1.0;
    if (a.includes(b) || b.includes(a)) return 0.85;
    const wa = new Set(a.split(/\s+/).filter(Boolean));
    const wb = new Set(b.split(/\s+/).filter(Boolean));
    if (wa.size === 0 || wb.size === 0) return 0;
    const common = [...wa].filter(w => wb.has(w)).length;
    return common / Math.max(wa.size, wb.size);
  }

  // ── Jikan se ek anime directly malId se fetch karo ──
  async function fetchByMalId(id) {
    try {
      const r = await fetch(`https://api.jikan.moe/v4/anime/${id}`);
      const d = await r.json();
      if (d.data) return d.data;
    } catch (e) { console.warn('Direct malId fetch failed:', id); }
    return null;
  }

  // ── Jikan title search + confident match ──
  // Returns best match only if similarity >= threshold, else null
  async function fetchByTitle(seasonTitle, threshold = 0.65) {
    try {
      const r = await fetch(
        `https://api.jikan.moe/v4/anime?q=${encodeURIComponent(seasonTitle)}&type=tv&limit=8&sfw`
      );
      const d = await r.json();
      if (!d.data?.length) return null;

      // Score every result
      let bestScore = 0;
      let bestMatch = null;
      for (const a of d.data) {
        const scores = [
          titleSimilarity(a.title, seasonTitle),
          titleSimilarity(a.title_english, seasonTitle),
          titleSimilarity(a.title_japanese, seasonTitle),
          // Also check synonyms
          ...(a.titles || []).map(t => titleSimilarity(t.title, seasonTitle))
        ];
        const score = Math.max(...scores);
        if (score > bestScore) {
          bestScore = score;
          bestMatch = a;
        }
      }

      console.log(`Jikan match for "${seasonTitle}": score=${bestScore.toFixed(2)}, found="${bestMatch?.title}"`);

      // Threshold se kam hai toh galat match — return null
      if (bestScore < threshold) {
        console.warn(`Low confidence match for "${seasonTitle}" (${bestScore.toFixed(2)}) — skipping Jikan data`);
        return null;
      }
      return bestMatch;
    } catch (e) {
      console.warn('Jikan title fetch failed:', seasonTitle, e.message);
      return null;
    }
  }

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
6. Use the EXACT MAL (MyAnimeList) title for each season

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

    // ════════════════════════════════════════════════════════
    //  Jikan se har season ka malId + image fetch karo
    //  Strategy:
    //  1. knownMalId hai → S1 ke liye direct lookup (100% correct)
    //  2. Baaki seasons → title search + similarity threshold
    //  3. Match nahi hua → malId/image blank rakho (details.html fallback use karega)
    // ════════════════════════════════════════════════════════
    const now = Date.now();

    for (let i = 0; i < parsed.seasons.length; i++) {
      const s = parsed.seasons[i];

      // Rate limiting — Jikan 3 req/sec allow karta hai
      if (i > 0) await new Promise(r => setTimeout(r, 400));

      // Default values
      parsed.seasons[i].watchedEpisodes = 0;
      parsed.seasons[i].episodesLastUpdated = now;

      // ── Strategy 1: knownMalId se direct lookup (S1 ya single-season) ──
      // knownMalId whi anime hai jo user ne details page pe dekha
      // Agar Gemini ne S1 title return kiya hai aur similarity high hai toh use karo
      if (knownMalId && i === 0) {
        const directData = await fetchByMalId(knownMalId);
        if (directData) {
          // Verify karo ki ye sach mein sahi series hai
          const sim = Math.max(
            titleSimilarity(directData.title, title),
            titleSimilarity(directData.title_english, title),
            titleSimilarity(directData.title, s.title)
          );
          if (sim >= 0.5) {
            console.log(`S1 direct malId match: ${directData.title} (sim=${sim.toFixed(2)})`);
            parsed.seasons[i].malId = directData.mal_id;
            parsed.seasons[i].image = directData.images?.jpg?.image_url || '';
            continue; // Next season
          } else {
            console.warn(`Direct malId sim too low (${sim.toFixed(2)}) for "${directData.title}" vs series "${title}" — falling through to title search`);
          }
        }
      }

      // ── Strategy 2: Title search with confidence threshold ──
      const bestMatch = await fetchByTitle(s.title, 0.65);
      if (bestMatch) {
        parsed.seasons[i].malId = bestMatch.mal_id;
        parsed.seasons[i].image = bestMatch.images?.jpg?.image_url || '';
      }
      // Match nahi mila → malId/image set mat karo
      // details.html fallback: s.malId || parseInt(malId) aur s.image || image use karega
    }

    return res.status(200).json(parsed);
  } catch(err) {
    console.error('gemini-seasons error:', err);
    return res.status(500).json({ error: err.message });
  }
}
