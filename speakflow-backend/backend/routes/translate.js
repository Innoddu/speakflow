const express = require('express');

const router = express.Router();

// Google Gemini (무료 티어) — 번역 / 단어 추출
// 키 발급: https://aistudio.google.com/app/apikey  (신용카드 불필요)
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-2.0-flash';

async function callGemini(systemPrompt, userText, jsonMode = false) {
  const key = process.env.GEMINI_API_KEY;
  if (!key) {
    const err = new Error('GEMINI_API_KEY is not set');
    err.status = 401;
    throw err;
  }

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${key}`;
  const body = {
    systemInstruction: { parts: [{ text: systemPrompt }] },
    contents: [{ parts: [{ text: userText }] }],
    generationConfig: {
      temperature: 0.3,
      ...(jsonMode ? { responseMimeType: 'application/json' } : {}),
    },
  };

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errText = await res.text();
    const err = new Error(`Gemini API error ${res.status}: ${errText.substring(0, 200)}`);
    err.status = res.status;
    throw err;
  }

  const data = await res.json();
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error('Gemini returned an empty response');
  return text.trim();
}

// Gemini 공통 에러 처리
function handleGeminiError(error, res, fallbackMsg) {
  console.error('❌ Error details:', { message: error.message, status: error.status });

  if (error.status === 401 || error.status === 403) {
    return res.status(401).json({ error: 'Authentication failed', details: 'GEMINI_API_KEY가 없거나 잘못되었습니다.' });
  }
  if (error.status === 429) {
    return res.status(429).json({ error: 'Rate limit exceeded', details: 'Gemini 무료 한도를 초과했습니다. 잠시 후 다시 시도해 주세요.' });
  }
  return res.status(500).json({ error: fallbackMsg, details: error.message || 'Unknown error occurred' });
}

// ── 문장 번역 (영 → 한) ─────────────────────────────────────────────
router.post('/', async (req, res) => {
  try {
    const { text, targetLanguage = 'ko' } = req.body;

    if (!text) {
      return res.status(400).json({ error: 'Text is required', details: 'Please provide text to translate' });
    }

    console.log(`🌐 Translating to ${targetLanguage}:`, text.substring(0, 80) + '...');

    const translation = await callGemini(
      'You are a professional translator. Translate the given English text to Korean naturally and accurately. ' +
        'Only respond with the Korean translation, no explanations or additional text.',
      text,
      false
    );

    console.log('✅ Translation completed:', translation.substring(0, 80) + '...');
    res.json({ success: true, translatedText: translation, originalText: text, targetLanguage });
  } catch (error) {
    console.error('❌ Translation error:', error.message);
    return handleGeminiError(error, res, 'Translation failed');
  }
});

// ── 핵심 단어/구 추출 (학습용 단어 카드) ────────────────────────────
router.post('/keywords', async (req, res) => {
  try {
    const { text } = req.body;

    if (!text) {
      return res.status(400).json({ error: 'Text is required', details: 'Please provide a sentence to analyze' });
    }

    console.log('📚 Extracting study keywords from:', text.substring(0, 80) + '...');

    const raw = await callGemini(
      'You are an English vocabulary tutor for Korean learners. ' +
        'From the given English sentence, pick the key words and important phrases/idioms ' +
        '(maximum 6) that a learner should study. Prefer phrasal verbs and idioms over basic words. ' +
        'For each, provide the English term exactly as it appears and a concise, natural Korean meaning in this context. ' +
        'Respond ONLY with JSON in this shape: {"items":[{"term":"...","meaning":"..."}]}',
      text,
      true
    );

    let items = [];
    try {
      const parsed = JSON.parse(raw);
      items = Array.isArray(parsed.items) ? parsed.items : [];
    } catch (parseError) {
      console.warn('⚠️ Failed to parse keywords JSON:', parseError.message);
      items = [];
    }

    items = items
      .filter((it) => it && it.term && it.meaning)
      .map((it) => ({ term: String(it.term), meaning: String(it.meaning) }));

    console.log(`✅ Extracted ${items.length} study items`);
    res.json({ success: true, items, originalText: text });
  } catch (error) {
    console.error('❌ Keyword extraction error:', error.message);
    return handleGeminiError(error, res, 'Keyword extraction failed');
  }
});

module.exports = router;
