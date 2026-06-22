// 자막(전사) 통합 서비스.
// 1순위: Supadata (실제 YouTube 자막 → 정확한 타임스탬프, 클라우드에서도 동작)
// 폴백: Gemini 영상 전사 (타임스탬프는 부정확하지만 키 없이도 동작)
const { transcribeYouTubeVideo } = require('./gemini');

// ── 마지막 문장 재생시간 추정 ──────────────────────────────────────
function estimateDuration(text) {
  const words = text.trim().split(/\s+/).length;
  return Math.max(1.2, words / 2.5);
}

// Gemini {text,start}[] → {text,start,end,duration}[] (end = 다음 시작)
function withTiming(sentences) {
  return sentences.map((s, i) => {
    const start = s.start;
    const end = i < sentences.length - 1 ? sentences[i + 1].start : start + estimateDuration(s.text);
    return { text: s.text, start, end, duration: Math.max(0.5, end - start) };
  });
}

// Supadata 세그먼트 → 문장 단위 병합 (정확한 타이밍 유지)
function mergeSegmentsToSentences(segments) {
  const out = [];
  let cur = null;
  for (const seg of segments) {
    const text = (seg.text || '').replace(/\s+/g, ' ').trim();
    if (!text) continue;
    if (!cur) {
      cur = { text, start: seg.start, end: seg.start + seg.duration };
    } else {
      cur.text += ' ' + text;
      cur.end = seg.start + seg.duration;
    }
    if (/[.!?]$/.test(text) || cur.text.length > 180) {
      out.push(cur);
      cur = null;
    }
  }
  if (cur) out.push(cur);

  return out.map((x) => ({
    text: x.text,
    start: x.start,
    end: x.end,
    duration: Math.max(0.5, x.end - x.start),
  }));
}

// Supadata에서 자막 가져오기 → [{text, start, duration}] (초 단위)
async function fetchSupadata(videoId) {
  const key = process.env.SUPADATA_API_KEY;
  if (!key) throw new Error('SUPADATA_API_KEY not set');

  const url = `https://api.supadata.ai/v1/youtube/transcript?videoId=${videoId}&lang=en`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30000);
  try {
    const res = await fetch(url, { headers: { 'x-api-key': key }, signal: controller.signal });
    if (!res.ok) throw new Error(`Supadata ${res.status}: ${(await res.text()).substring(0, 150)}`);
    const data = await res.json();

    // 응답 형태: { content: [{ text, offset(ms), duration(ms), lang }], ... }
    const segs = Array.isArray(data.content) ? data.content : Array.isArray(data.transcript) ? data.transcript : [];
    return segs
      .map((s) => ({
        text: s.text || '',
        // Supadata는 offset/duration을 ms로 준다. (start가 직접 오면 초로 간주)
        start: s.offset !== undefined ? s.offset / 1000 : Number(s.start) || 0,
        duration: s.duration !== undefined ? s.duration / 1000 : 1,
      }))
      .filter((s) => s.text.trim());
  } finally {
    clearTimeout(timer);
  }
}

// 통합 진입점 → { sentences:[{text,start,end,duration}], source }
async function getTranscript(videoId) {
  // 1) Supadata (정확)
  if (process.env.SUPADATA_API_KEY) {
    try {
      const segments = await fetchSupadata(videoId);
      if (segments.length) {
        console.log(`✅ Supadata: ${segments.length} segments`);
        return { sentences: mergeSegmentsToSentences(segments), source: 'supadata' };
      }
    } catch (e) {
      console.warn('⚠️ Supadata failed, falling back to Gemini:', e.message);
    }
  }

  // 2) Gemini 폴백
  const raw = await transcribeYouTubeVideo(videoId);
  return { sentences: withTiming(raw), source: 'gemini' };
}

module.exports = { getTranscript };
