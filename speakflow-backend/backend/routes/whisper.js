// 자막(스크립트) 생성 라우트 — captions-only 전략.
// youtube-transcript-api 로 영어 자막을 가져와 문장 단위로 분할해 반환한다.
const express = require('express');
const router = express.Router();
const { spawn } = require('child_process');
const { fetchTranscript } = require('../services/transcript-api');

// ── 메모리 정리 (spaCy 서브프로세스 후) ──────────────────────────────
function cleanupMemory() {
  if (global.gc) global.gc();
}

// ── 자막 조각을 문장 단위로 1차 병합 ────────────────────────────────
// youtube-transcript-api 결과([{text,start,duration}])를 문장 비슷한 청크로 합친다.
// 이후 spaCy 가 경계를 더 자연스럽게 다듬는다.
function mergeIntoSentences(captions) {
  const sentences = [];
  let cur = { text: '', start: 0, end: 0 };

  captions.forEach((cap, i) => {
    const text = (cap.text || '').replace(/\s+/g, ' ').trim();
    if (!text) return;

    const start = Number(cap.start) || 0;
    const end = start + (Number(cap.duration) || 0);

    if (cur.text === '') {
      cur = { text, start, end };
    } else {
      cur.text += ' ' + text;
      cur.end = end;
    }

    const endsSentence = /[.!?]$/.test(text);
    const tooLong = cur.text.length > 200;
    if (endsSentence || tooLong || i === captions.length - 1) {
      sentences.push({
        text: cur.text.trim(),
        start: cur.start,
        end: cur.end,
        duration: cur.end - cur.start,
      });
      cur = { text: '', start: 0, end: 0 };
    }
  });

  return sentences;
}

// ── spaCy 로 문장 경계 개선 (실패 시 입력 그대로 반환) ───────────────
async function improveSentencesWithSpacy(sentences) {
  try {
    const fullText = sentences.map((s) => s.text).join(' ');

    const spacySentences = await new Promise((resolve, reject) => {
      const python = spawn('python3', ['-c', `
import spacy, sys, json
try:
    nlp = spacy.load('en_core_web_sm')
    text = sys.stdin.read()
    doc = nlp(text)
    print(json.dumps([s.text.strip() for s in doc.sents if s.text.strip()]))
except Exception as e:
    print(json.dumps({"error": str(e)}), file=sys.stderr)
    sys.exit(1)
`]);

      let output = '';
      let errorOutput = '';
      python.stdout.on('data', (d) => (output += d.toString()));
      python.stderr.on('data', (d) => (errorOutput += d.toString()));

      python.on('close', (code) => {
        setTimeout(cleanupMemory, 100);
        if (code === 0) {
          try {
            resolve(JSON.parse(output.trim()));
          } catch (e) {
            reject(new Error(`Failed to parse spaCy output: ${e.message}`));
          }
        } else {
          reject(new Error(`spaCy process failed: ${errorOutput}`));
        }
      });
      python.on('error', (e) => reject(e));

      python.stdin.write(fullText);
      python.stdin.end();

      setTimeout(() => {
        if (!python.killed) {
          python.kill('SIGKILL');
          reject(new Error('Python process timeout'));
        }
      }, 30000);
    });

    console.log(`🔄 spaCy improved sentences: ${sentences.length} → ${spacySentences.length}`);

    // spaCy 문장을 원본 타이밍에 매핑
    const improved = [];
    for (const spacySentence of spacySentences) {
      const fullText = sentences.map((s) => s.text).join(' ');
      const sentenceStart = fullText.indexOf(spacySentence);
      const sentenceEnd = sentenceStart + spacySentence.length;

      let earliestStart = null;
      let latestEnd = null;
      let charPosition = 0;

      for (const orig of sentences) {
        const origStart = charPosition;
        const origEnd = charPosition + orig.text.length;
        const hasOverlap = !(origEnd <= sentenceStart || origStart >= sentenceEnd);
        if (hasOverlap) {
          if (earliestStart === null || orig.start < earliestStart) earliestStart = orig.start;
          if (latestEnd === null || orig.end > latestEnd) latestEnd = orig.end;
        }
        charPosition += orig.text.length + 1; // +1 for space
      }

      if (earliestStart !== null && latestEnd !== null) {
        const rawDuration = latestEnd - earliestStart;
        const wordCount = spacySentence.split(/\s+/).length;
        const estimatedDuration = wordCount / 2.5; // ~2.5 words/sec
        const minDuration = Math.max(0.8, wordCount * 0.25);
        const maxDuration = Math.min(rawDuration, estimatedDuration + 0.5);

        const finalDuration = wordCount <= 5
          ? Math.max(minDuration, Math.min(maxDuration, wordCount * 0.4 + 0.5))
          : Math.max(minDuration, Math.min(maxDuration, 8.0));

        improved.push({
          text: spacySentence,
          start: earliestStart,
          end: earliestStart + finalDuration,
          duration: finalDuration,
        });
      }
    }

    console.log(`✅ spaCy sentence improvement completed: ${improved.length} sentences`);
    return improved.length > 0 ? improved : sentences;
  } catch (error) {
    console.warn('⚠️ spaCy improvement failed:', error.message, '→ 원본 문장 사용');
    return sentences;
  }
}

// ── GET /youtube-subtitles/:videoId ─────────────────────────────────
// 영어 자막을 가져와 문장 단위 스크립트로 반환. 프론트엔드가 사용하는 엔드포인트.
router.get('/youtube-subtitles/:videoId', async (req, res) => {
  try {
    const { videoId } = req.params;
    const { useSpacy = 'true' } = req.query;

    console.log(`📺 Fetching subtitles for: ${videoId} (spaCy: ${useSpacy})`);

    const captions = await fetchTranscript(videoId); // [{text,start,duration}]
    let sentences = mergeIntoSentences(captions);

    if (useSpacy === 'true') {
      sentences = await improveSentencesWithSpacy(sentences);
    }

    return res.json({
      success: true,
      source: useSpacy === 'true' ? 'youtube-transcript-api+spacy' : 'youtube-transcript-api',
      sentences,
      captionCount: captions.length,
      spacyImproved: useSpacy === 'true',
    });
  } catch (error) {
    console.error('❌ Subtitle fetch failed:', error.message);
    return res.status(404).json({
      success: false,
      error: 'No English subtitles available',
      details: '이 영상은 영어 자막이 없습니다. 자막 있는 영상을 선택해 주세요.',
      videoId: req.params.videoId,
    });
  }
});

module.exports = router;
