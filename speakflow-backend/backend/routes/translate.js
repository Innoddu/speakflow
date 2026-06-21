const express = require('express');
const { callGeminiText, handleGeminiError } = require('../services/gemini');

const router = express.Router();

// ── 문장 번역 (영 → 한) ─────────────────────────────────────────────
router.post('/', async (req, res) => {
  try {
    const { text, targetLanguage = 'ko' } = req.body;

    if (!text) {
      return res.status(400).json({ error: 'Text is required', details: 'Please provide text to translate' });
    }

    const translation = await callGeminiText(
      'You are a professional translator. Translate the given English text to Korean naturally and accurately. ' +
        'Only respond with the Korean translation, no explanations or additional text.',
      text,
      false
    );

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

    const raw = await callGeminiText(
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

    res.json({ success: true, items, originalText: text });
  } catch (error) {
    console.error('❌ Keyword extraction error:', error.message);
    return handleGeminiError(error, res, 'Keyword extraction failed');
  }
});

module.exports = router;
