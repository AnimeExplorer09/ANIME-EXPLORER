export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { seasons } = req.body;
  if (!Array.isArray(seasons) || seasons.length === 0)
    return res.status(400).json({ error: 'seasons array required' });

  const results = [];

  for (let i = 0; i < seasons.length; i++) {
    const s = seasons[i];
    if (i > 0) await new Promise(r => setTimeout(r, 300));

    let episodes = s.episodes || 0;
    let isAiring = s.isAiring || false;
    let latestEpisode = s.latestEpisode || 0;

        // AniList → real-time episode data via exact malId
    try {
      const aniQuery = `
        query ($idMal: Int) {
          Media(idMal: $idMal, type: ANIME) {
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
        body: JSON.stringify({ query: aniQuery, variables: { idMal: parseInt(s.malId) } })
      });
      
      const aData = await aRes.json();
      const media = aData?.data?.Media;

      if (media) {
        if (media.status === 'FINISHED' && media.episodes) {
          episodes      = media.episodes;
          latestEpisode = media.episodes;
          isAiring      = false;
        } else if (media.status === 'RELEASING') {
          isAiring = true;
          if (media.nextAiringEpisode?.episode) {
            latestEpisode = media.nextAiringEpisode.episode - 1;
            episodes      = latestEpisode;
          } else if (media.airingSchedule?.nodes?.[0]?.episode) {
            latestEpisode = media.airingSchedule.nodes[0].episode;
            episodes      = latestEpisode;
          } else if (media.episodes) {
            episodes      = media.episodes;
            latestEpisode = media.episodes;
          }
        }
      }
    } catch(e) {
      console.warn('AniList failed for:', s.title);
      // Fallback: Jikan (only reliable for finished anime)
      try {
        if (s.malId) {
          const jRes  = await fetch(`https://api.jikan.moe/v4/anime/${s.malId}`);
          const jData = await jRes.json();
          if (jData.data?.episodes) {
            episodes      = jData.data.episodes;
            latestEpisode = jData.data.episodes;
            isAiring      = jData.data.airing || false;
          }
        }
      } catch(e2) { console.warn('Jikan also failed:', e2); }
    }

    results.push({ num: s.num, episodes, isAiring, latestEpisode });
  }

  return res.status(200).json({ results });
}
