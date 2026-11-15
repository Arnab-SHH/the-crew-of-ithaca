// Talks to the Crew of Ithaca backend and checks the notebook photo.
// The backend runs on this same computer, so no tunnel is needed.
const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:4000';
const OPENAI_VISION_MODEL = process.env.VISION_MODEL || 'gpt-4o-mini';
const GEMINI_VISION_MODEL = process.env.GEMINI_VISION_MODEL || 'gemini-2.5-flash';

const CHECK_PROMPT = 'You check phone-camera photos for a study game. Reply only with JSON {"verified": boolean, "item": string}. '
  + '"verified" is true if you can see a notebook, textbook, worksheet, or paper with handwritten or printed study notes '
  + 'being shown to the camera, even if it is partly out of frame, tilted, sideways, close up, or a little blurry. '
  + 'It is false for a phone, tablet, blank page, or a photo with no study material. '
  + '"item" briefly describes what the photo actually shows.';

/** POST to the game backend. Never throws: returns { ok: false, error } instead. */
export async function tellGame(path, body) {
  try {
    const res = await fetch(`${BACKEND_URL}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(5000),
    });
    return await res.json();
  } catch (error) {
    return { ok: false, error: error.message };
  }
}

/**
 * Asks a vision model whether the photo shows study notes: Gemini when GOOGLE_API_KEY
 * is set (free tier), otherwise OpenAI. Returns { verified: boolean, item: string }.
 */
export async function checkStudyNotes(imageDataUrl) {
  const parsed = process.env.GOOGLE_API_KEY ? await askGemini(imageDataUrl) : await askOpenAI(imageDataUrl);
  return { verified: parsed.verified === true, item: String(parsed.item || 'something') };
}

async function askGemini(imageDataUrl) {
  const [header, data] = imageDataUrl.split(',');
  const mimeType = header.slice('data:'.length, header.indexOf(';'));
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_VISION_MODEL}:generateContent`, {
    method: 'POST',
    headers: { 'x-goog-api-key': process.env.GOOGLE_API_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: CHECK_PROMPT }] },
      contents: [{ role: 'user', parts: [{ text: 'Is the student holding up study notes?' }, { inlineData: { mimeType, data } }] }],
      generationConfig: { responseMimeType: 'application/json' },
    }),
    signal: AbortSignal.timeout(20000),
  });
  if (!res.ok) throw new Error(`vision check failed: HTTP ${res.status}`);
  const json = await res.json();
  return JSON.parse(json.candidates[0].content.parts[0].text);
}

async function askOpenAI(imageDataUrl) {
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: OPENAI_VISION_MODEL,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: CHECK_PROMPT },
        {
          role: 'user',
          content: [
            { type: 'text', text: 'Is the student holding up study notes?' },
            { type: 'image_url', image_url: { url: imageDataUrl, detail: 'low' } },
          ],
        },
      ],
    }),
    signal: AbortSignal.timeout(20000),
  });
  if (!res.ok) throw new Error(`vision check failed: HTTP ${res.status}`);
  const json = await res.json();
  return JSON.parse(json.choices[0].message.content);
}
