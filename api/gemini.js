export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { imageBase64 } = req.body;
  if (!imageBase64) {
    return res.status(400).json({ error: 'No image data' });
  }

  const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
  if (!GEMINI_API_KEY) {
    return res.status(500).json({ error: 'API key not configured on server' });
  }

  // Detect mime type from base64? Actually frontend sends raw base64 without prefix, so assume JPEG
  // But we can try to detect from first few chars? Better to ask frontend to send mime type.
  // For now, hardcode jpeg.
  const mimeType = "image/jpeg";
  
  const prompt = "Identify this anime. Return ONLY the English name. If you are not sure, return 'UNKNOWN'.";

  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`;
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{
          parts: [
            { text: prompt },
            { inline_data: { mime_type: mimeType, data: imageBase64 } }
          ]
        }]
      })
    });

    const data = await response.json();
    console.log('Gemini response:', JSON.stringify(data, null, 2));

    // Check for errors from Gemini
    if (data.error) {
      return res.status(400).json({ error: `Gemini error: ${data.error.message}` });
    }

    let animeName = data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || '';
    
    // Remove any extra quotes or punctuation
    animeName = animeName.replace(/^["']|["']$/g, '').split('\n')[0];
    
    if (!animeName || animeName === 'UNKNOWN' || animeName.length < 2) {
      return res.status(404).json({ error: 'Could not identify anime from this image' });
    }

    res.status(200).json({ animeName });
  } catch (err) {
    console.error('Proxy error:', err);
    res.status(500).json({ error: `Server error: ${err.message}` });
  }
}