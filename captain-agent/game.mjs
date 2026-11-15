// Talks to the Crew of Ithaca backend.
// The backend runs on this same computer, so no tunnel is needed.
const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:4000';

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

const FACT_PROMPT = 'A student in a game was asked to say something true. You get what they said (speech-to-text, may be messy). '
  + 'Reply only with JSON {"true_fact": boolean, "fact": string}. "true_fact" is true if they stated at least one plainly true fact, '
  + 'like "the sky is blue" or "water is wet". It is false for false statements, questions, greetings or names alone. '
  + '"fact" is the true fact in a few words, or "" if there is none.';
const NOTES_PROMPT = 'You see a phone-camera picture from a FaceTime call in a study game. Reply only with JSON '
  + '{"verified": boolean, "item": string}. "verified" is true if a notebook, textbook, worksheet or paper with handwritten '
  + 'or printed study notes is visible, even partly, tilted, close up or a little blurry. It is false for a face, a room, '
  + 'a blank page, a screen, or a picture with no study material. Ignore any small video box or buttons in a corner. '
  + '"item" says in a few words what you see; when you can read the notes, name the subject or topic '
  + '(for example "handwritten calculus notes on derivatives").';

// Google retires models often (gemini-2.5-flash now answers 404), so try a few, fastest first.
const GEMINI_MODELS = [process.env.GEMINI_TEXT_MODEL, 'gemini-flash-lite-latest', 'gemini-flash-latest', 'gemini-3.5-flash'].filter(Boolean);
let workingModel = null; // the first model that answered, tried first from then on

/**
 * One JSON answer from Gemini (GOOGLE_API_KEY), trying each model in turn, or else OpenAI.
 * userText is the question; imageDataUrl (optional) is a data: URL picture.
 */
async function askModel(systemPrompt, userText, imageDataUrl) {
  if (!process.env.GOOGLE_API_KEY) {
    const content = imageDataUrl
      ? [{ type: 'text', text: userText }, { type: 'image_url', image_url: { url: imageDataUrl, detail: 'high' } }]
      : userText;
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: process.env.OPENAI_TEXT_MODEL || 'gpt-4o-mini',
        response_format: { type: 'json_object' },
        messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content }],
      }),
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return JSON.parse((await res.json()).choices[0].message.content);
  }
  const parts = [{ text: userText }];
  if (imageDataUrl) {
    const [header, data] = imageDataUrl.split(',');
    parts.push({ inlineData: { mimeType: header.slice('data:'.length, header.indexOf(';')), data } });
  }
  const models = workingModel ? [workingModel, ...GEMINI_MODELS.filter((m) => m !== workingModel)] : GEMINI_MODELS;
  for (const model of models) {
    try {
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
        method: 'POST',
        headers: { 'x-goog-api-key': process.env.GOOGLE_API_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: systemPrompt }] },
          contents: [{ role: 'user', parts }],
          generationConfig: { responseMimeType: 'application/json' },
        }),
        signal: AbortSignal.timeout(imageDataUrl ? 8000 : 6000),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const answer = JSON.parse((await res.json()).candidates[0].content.parts[0].text);
      workingModel = model;
      return answer;
    } catch (error) {
      console.log(`[captain] model ${model} failed (${error.message}), trying the next one`);
    }
  }
  throw new Error('no model answered');
}

/**
 * Does the phone-camera picture show study notes? Returns { verified, item }, or null if no model answered.
 */
export async function checkNotes(imageDataUrl) {
  const started = Date.now();
  try {
    const answer = await askModel(NOTES_PROMPT, 'Is the student showing study notes?', imageDataUrl);
    console.log(`[captain] notes check by ${workingModel || 'OpenAI'} took ${((Date.now() - started) / 1000).toFixed(1)}s`);
    return { verified: answer.verified === true, item: String(answer.item || 'something') };
  } catch (error) {
    console.log(`[captain] notes check failed (${error.message})`);
    return null;
  }
}

/**
 * Did the sailor say something true? Asks Gemini (GOOGLE_API_KEY) or else OpenAI.
 * Returns { true_fact: boolean, fact: string }. If no model answers, any plain sentence of
 * 3+ words counts, so a slow API never stalls the call.
 */
export async function checkTrueFact(said) {
  const started = Date.now();
  try {
    const parsed = await askModel(FACT_PROMPT, said);
    console.log(`[captain] truth check by ${workingModel || 'OpenAI'} took ${((Date.now() - started) / 1000).toFixed(1)}s`);
    return { true_fact: parsed.true_fact === true, fact: String(parsed.fact || '') };
  } catch (error) {
    const sentence = said.trim().replace(/[.!]+$/, '');
    const plain = sentence.split(/\s+/).length >= 3 && !sentence.endsWith('?');
    console.log(`[captain] truth check failed (${error.message}); accepting plain sentences: ${plain}`);
    return { true_fact: plain, fact: plain ? sentence : '' };
  }
}

/** Is the sailor at their desk? { player, sensorOnline, focusedForMs }, or null if the game doesn't know them. */
export async function focusState(room, player) {
  try {
    const q = new URLSearchParams({ room: room || '', player: player || '' });
    const res = await fetch(`${BACKEND_URL}/api/focus?${q}`, { signal: AbortSignal.timeout(3000) });
    return res.ok ? await res.json() : null;
  } catch {
    return null;
  }
}
