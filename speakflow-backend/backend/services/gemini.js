// Google Gemini (무료 티어) 공통 모듈 — 번역 · 단어추출 · 영상 전사.
// 키 발급: https://aistudio.google.com/app/apikey
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
const BASE = 'https://generativelanguage.googleapis.com/v1beta/models';

function getKey() {
  const key = process.env.GEMINI_API_KEY;
  if (!key) {
    const e = new Error('GEMINI_API_KEY is not set');
    e.status = 401;
    throw e;
  }
  return key;
}

// generateContent 호출 → 응답 텍스트 반환
async function generate(body, timeoutMs = 120000) {
  const url = `${BASE}/${GEMINI_MODEL}:generateContent?key=${getKey()}`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    if (!res.ok) {
      const t = await res.text();
      const e = new Error(`Gemini API error ${res.status}: ${t.substring(0, 200)}`);
      e.status = res.status;
      throw e;
    }
    const data = await res.json();
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) throw new Error('Gemini returned an empty response');
    return text.trim();
  } finally {
    clearTimeout(timer);
  }
}

// 텍스트 생성 (번역 / 단어 추출)
async function callGeminiText(systemPrompt, userText, jsonMode = false) {
  return generate({
    systemInstruction: { parts: [{ text: systemPrompt }] },
    contents: [{ parts: [{ text: userText }] }],
    generationConfig: { temperature: 0.3, ...(jsonMode ? { responseMimeType: 'application/json' } : {}) },
  });
}

// 유튜브 영상 전사 → [{ text, start }]  (start = 초)
// 구글이 직접 유튜브에 접근하므로 클라우드 IP 차단을 받지 않는다.
async function transcribeYouTubeVideo(videoId) {
  const url = `https://www.youtube.com/watch?v=${videoId}`;
  const raw = await generate(
    {
      contents: [
        {
          parts: [
            { file_data: { file_uri: url } },
            {
              text:
                'Transcribe the spoken English in this video into natural, short sentences ' +
                '(one spoken sentence each). ' +
                'Skip standalone filler interjections that are a single word (e.g., "Yes.", "Yeah.", "Okay.", "Uh.", "Right.", "Mm-hmm."); ' +
                'either merge them into the adjacent sentence or omit them. ' +
                'Return JSON: {"sentences":[{"text":"...","start":<seconds as number>}]}. ' +
                'start = the time (in seconds) when the sentence begins.',
            },
          ],
        },
      ],
      generationConfig: { temperature: 0.2, responseMimeType: 'application/json' },
    },
    150000 // 영상 처리는 더 오래 걸릴 수 있음
  );

  let sentences = [];
  try {
    const parsed = JSON.parse(raw);
    sentences = Array.isArray(parsed.sentences) ? parsed.sentences : [];
  } catch (e) {
    console.warn('⚠️ Failed to parse transcription JSON:', e.message);
    sentences = [];
  }

  return sentences
    .filter((s) => s && s.text && typeof s.start === 'number')
    .map((s) => ({ text: String(s.text).trim(), start: Number(s.start) }))
    .sort((a, b) => a.start - b.start);
}

// 공통 에러 처리
function handleGeminiError(error, res, fallbackMsg) {
  console.error('❌ Gemini error:', { message: error.message, status: error.status });

  if (error.name === 'AbortError') {
    return res.status(504).json({ error: 'Timeout', details: 'Gemini 응답이 지연되었습니다. 다시 시도해 주세요.' });
  }
  if (error.status === 401 || error.status === 403) {
    return res.status(401).json({ error: 'Authentication failed', details: 'GEMINI_API_KEY가 없거나 잘못되었습니다.' });
  }
  if (error.status === 429) {
    return res.status(429).json({ error: 'Rate limit exceeded', details: 'Gemini 무료 한도를 초과했습니다. 잠시 후 다시 시도해 주세요.' });
  }
  return res.status(500).json({ error: fallbackMsg, details: error.message || 'Unknown error occurred' });
}

module.exports = { callGeminiText, transcribeYouTubeVideo, handleGeminiError };
