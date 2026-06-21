// 스크립트(자막) 생성 라우트 — Gemini 영상 전사 기반.
// 클라우드 IP 차단 없이 동작하며, 결과는 로컬에 캐시한다.
const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const { transcribeYouTubeVideo, handleGeminiError } = require('../services/gemini');

// 전사 캐시 디렉터리
const cacheDir = path.join(__dirname, '..', 'data', 'transcripts');
fs.mkdirSync(cacheDir, { recursive: true });

// 문장 길이로 마지막 문장 재생시간 추정
function estimateDuration(text) {
  const words = text.trim().split(/\s+/).length;
  return Math.max(1.2, words / 2.5); // ~2.5 words/sec
}

// {text,start}[] → {text,start,end,duration}[]  (end = 다음 문장 시작)
function withTiming(sentences) {
  return sentences.map((s, i) => {
    const start = s.start;
    const end = i < sentences.length - 1 ? sentences[i + 1].start : start + estimateDuration(s.text);
    return { text: s.text, start, end, duration: Math.max(0.5, end - start) };
  });
}

// GET /youtube-subtitles/:videoId — 프론트엔드가 사용하는 스크립트 생성 엔드포인트
router.get('/youtube-subtitles/:videoId', async (req, res) => {
  const { videoId } = req.params;
  const cacheFile = path.join(cacheDir, `${videoId}.json`);

  try {
    // 1) 캐시 확인
    if (fs.existsSync(cacheFile)) {
      const cached = JSON.parse(fs.readFileSync(cacheFile, 'utf8'));
      console.log(`⚡ Transcript cache hit: ${videoId} (${cached.length} sentences)`);
      return res.json({ success: true, source: 'gemini-cache', sentences: cached });
    }

    // 2) Gemini로 영상 전사
    console.log(`🎬 Transcribing ${videoId} with Gemini...`);
    const raw = await transcribeYouTubeVideo(videoId);

    if (!raw.length) {
      return res.status(404).json({
        success: false,
        error: 'Transcription failed',
        details: '영상을 전사하지 못했습니다. 다른 영상을 시도해 주세요.',
        videoId,
      });
    }

    const sentences = withTiming(raw);
    try {
      fs.writeFileSync(cacheFile, JSON.stringify(sentences));
    } catch (e) {
      console.warn('⚠️ Failed to write transcript cache:', e.message);
    }

    console.log(`✅ Transcribed ${videoId}: ${sentences.length} sentences`);
    return res.json({ success: true, source: 'gemini', sentences });
  } catch (error) {
    console.error('❌ Transcription error:', error.message);
    return handleGeminiError(error, res, 'Transcription failed');
  }
});

module.exports = router;
