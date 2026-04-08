export default async function handler(req, res) {
  // Sirf POST requests allow karo
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { imageBase64 } = req.body;
  if (!imageBase64) {
    return res.status(400).json({ error: 'No image data' });
  }

  const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
  if (!GEMINI_API_KEY) {
    return res.status(500).json({ error: 'API key missing on server' });
  }

  const prompt = "Identify this anime. Return ONLY the English name.";
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`;

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{
          parts: [
            { text: prompt },
            { inline_data: { mime_type: "image/jpeg", data: imageBase64 } }
          ]
        }]
      })
    });
    
    const data = await response.json();
    const animeName = data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || '';
    
    if (!animeName) {
      return res.status(404).json({ error: 'Could not identify anime' });
    }
    
    res.status(200).json({ animeName });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
}