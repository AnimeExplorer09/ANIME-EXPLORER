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
    `Season ${s.num}: "${s.title}" (MAL ID: ${s.malId})`
  ).join('\n');

  const prompt = `Search the internet right now and find the CURRENT and ACCURATE episode information for these anime seasons:

${list}

For each season find:
1. Total episode count (final count if finished, current episode count if still airing)
2. Whether it is currently airing new episodes in 2025 or 2026
3. The latest episode number that has actually aired

IMPORTANT: Use your search capability to get the most up-to-date information. For long-running anime like One Piece, Naruto Shippuden etc, give the actual current episode number.

Return ONLY this exact JSON (no markdown, no extra text):
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
- NEVER return episodes: 0 unless the anime literally has zero episodes released
- For One Piece: episodes should be 1000+ 
- For ongoing anime give current aired episode count
- Return ONLY the raw JSON`;

  try {
    // Use gemini-2.0-flash with Google Search grounding for real-time data
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`;
    
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        tools: [{ google_search: {} }],  // ← Real-time internet search
        generationConfig: { 
          temperature: 0.1, 
          maxOutputTokens: 1024,
          responseMimeType: "text/plain"
        }
      })
    });

    const data = await response.json();
    
    if (data.error) {
      console.error('Gemini API error:', data.error);
      // Fallback without search tool
      return await fallbackFetch(req, res, seasons, GEMINI_API_KEY, prompt);
    }

    let raw = data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || '';
    raw = raw.replace(/^```json\s*/i,'').replace(/^```\s*/i,'').replace(/\s*```$/i,'').trim();
    
    // Extract JSON if there's extra text around it
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (jsonMatch) raw = jsonMatch[0];

    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed.results))
      return res.status(500).json({ error: 'Invalid response' });

    console.log('Gemini episodes result:', JSON.stringify(parsed));
    return res.status(200).json(parsed);

  } catch (err) {
    console.error('gemini-episodes error:', err);
    return res.status(500).json({ error: err.message });
  }
}

// Fallback: without search tool (uses training data)
async function fallbackFetch(req, res, seasons, apiKey, prompt) {
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
    return res.status(500).json({ error: 'Both Gemini calls failed: ' + e.message });
  }
}
