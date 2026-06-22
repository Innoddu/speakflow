// 스크립트(자막) 생성 라우트.
// Supadata(정확한 타임스탬프) 우선, 없으면 Gemini 폴백. 결과는 로컬 캐시.
const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const { getTranscript } = require('../services/transcript');
const { handleGeminiError } = require('../services/gemini');

// 전사 캐시 디렉터리
const cacheDir = path.join(__dirname, '..', 'data', 'transcripts');
fs.mkdirSync(cacheDir, { recursive: true });

// 단어 수 (구두점 제외)
function wordCount(text) {
  return text.trim().replace(/[^\w\s']/g, ' ').split(/\s+/).filter(Boolean).length;
}

// 학습 가치가 있는 문장인가 (한 단어짜리 필러 제외: yes, yeah, okay 등)
function isMeaningful(text) {
  return wordCount(text) >= 2;
}

// GET /youtube-subtitles/:videoId — 프론트엔드가 사용하는 스크립트 생성 엔드포인트
router.get('/youtube-subtitles/:videoId', async (req, res) => {
  const { videoId } = req.params;
  const cacheFile = path.join(cacheDir, `${videoId}.json`);

  try {
    // 1) 캐시 확인 (옛 배열 포맷도 호환, 한 단어짜리 필러는 응답 시 거른다)
    if (fs.existsSync(cacheFile)) {
      const data = JSON.parse(fs.readFileSync(cacheFile, 'utf8'));
      const arr = Array.isArray(data) ? data : data.sentences || [];
      const src = Array.isArray(data) ? 'cache' : data.source;
      const sentences = arr.filter((s) => isMeaningful(s.text));
      console.log(`⚡ Transcript cache hit: ${videoId} (${sentences.length} sentences, ${src})`);
      return res.json({ success: true, source: src + '-cache', sentences });
    }

    // 2) Supadata 또는 Gemini로 전사
    console.log(`🎬 Getting transcript for ${videoId}...`);
    const { sentences: all, source } = await getTranscript(videoId);
    const sentences = all.filter((s) => isMeaningful(s.text));

    if (!sentences.length) {
      return res.status(404).json({
        success: false,
        error: 'Transcription failed',
        details: '영상을 전사하지 못했습니다. 다른 영상을 시도해 주세요.',
        videoId,
      });
    }

    try {
      fs.writeFileSync(cacheFile, JSON.stringify({ source, sentences }));
    } catch (e) {
      console.warn('⚠️ Failed to write transcript cache:', e.message);
    }

    console.log(`✅ Transcript ready (${source}): ${sentences.length} sentences`);
    return res.json({ success: true, source, sentences });
  } catch (error) {
    console.error('❌ Transcription error:', error.message);
    return handleGeminiError(error, res, 'Transcription failed');
  }
});

module.exports = router;
