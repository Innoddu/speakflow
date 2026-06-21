# 스크립트 생성 구현 계획

> [`script-generation-analysis.md`](./script-generation-analysis.md)에서 권장한 **방안 A(자막 있는 영상만 대상)** 를 기준으로 한 단계별 구현 가이드. 추출은 **youtube-transcript-api 단일 경로**, 검색 단계에서 자막 있는 영상만 노출한다. (방안 B의 Whisper 폴백은 §6에 옵션으로 정리)

> 작성일: 2026-06-21

---

## 0. 목표 동작

```
사용자가 영상 선택
  → GET /api/youtube/transcript-practice/:videoId
  → 한 문장씩 분리된 영어 스크립트 + 타이밍 반환
  → 프론트엔드가 문장 카드로 표시 (TTS · 번역 · 따라 말하기)
```

응답 형식(기존과 동일하게 유지 → 프론트엔드 무변경):

```json
{
  "sentences": [
    { "text": "A few years ago, I broke into my own house.", "start": 13.24, "end": 15.8, "duration": 2.56 }
  ],
  "totalDuration": 540.2,
  "source": "youtube-transcript-api",
  "spacyImproved": true
}
```

---

## 1. 작업 개요 (방안 A)

| 단계 | 작업 | 파일 | 난이도 |
|:---:|------|------|:---:|
| 1 | Python 자막 추출 스크립트 작성 | `backend/scripts/fetch_transcript.py` (신규) | 하 |
| 2 | Node에서 호출하는 서비스 함수 (추출 + 존재확인) | `backend/services/transcript-api.js` (신규) | 하 |
| 3 | `transcript-practice` 라우트를 youtube-transcript-api로 교체 | `backend/routes/youtube.js` | 중 |
| 4 | **검색 필터** — 자막 있는 영상만 노출 | `backend/routes/youtube.js` (`/search`) | 중 |
| 5 | 의존성 설치 (배포 포함) | `Dockerfile`, `nixpacks.toml` | 하 |
| 6 | (옵션) Whisper 폴백 — 방안 B | `youtube.js`, `whisper.js`, `youtube-captions.js` | 중 |

---

## 2. 단계별 구현

### 단계 1 — Python 자막 추출 스크립트

`backend/scripts/fetch_transcript.py`:

```python
#!/usr/bin/env python3
import sys, json
from youtube_transcript_api import YouTubeTranscriptApi
from youtube_transcript_api._errors import (
    TranscriptsDisabled, NoTranscriptFound, VideoUnavailable,
)

def main():
    mode = sys.argv[1]       # "fetch" | "check"
    video_id = sys.argv[2]
    try:
        if mode == "check":
            # 영어 자막 존재 여부만 빠르게 확인 (검색 필터용)
            tl = YouTubeTranscriptApi.list_transcripts(video_id)
            has_en = any(t.language_code.startswith('en') for t in tl)
            print(json.dumps({"success": True, "hasEnglish": has_en}))
            return
        # mode == "fetch": 수동 자막 우선, 없으면 자동 생성 자막
        transcript = YouTubeTranscriptApi.get_transcript(
            video_id, languages=['en', 'en-US', 'en-GB']
        )
        # [{text, start, duration}, ...] 그대로 출력
        print(json.dumps({"success": True, "captions": transcript}))
    except (TranscriptsDisabled, NoTranscriptFound):
        print(json.dumps({"success": False, "error": "no_captions"}))
    except VideoUnavailable:
        print(json.dumps({"success": False, "error": "video_unavailable"}))
    except Exception as e:
        print(json.dumps({"success": False, "error": str(e)}))

if __name__ == "__main__":
    main()
```

> 참고: `youtube-transcript-api` 1.x는 인스턴스 API(`YouTubeTranscriptApi().fetch(...)` / `.list(...)`)도 제공한다. 위 정적 메서드는 호환성을 위해 유지되며 실측에서 정상 동작 확인됨. `list_transcripts`는 manual/auto 영어 자막을 정확히 구분한다.

### 단계 2 — Node 서비스 래퍼 (추출 + 존재확인)

`backend/services/transcript-api.js`:

```javascript
const { spawn } = require('child_process');
const path = require('path');

function runPy(mode, videoId) {
  return new Promise((resolve, reject) => {
    const script = path.join(__dirname, '..', 'scripts', 'fetch_transcript.py');
    const py = spawn('python3', [script, mode, videoId]);

    let out = '', err = '';
    py.stdout.on('data', d => (out += d));
    py.stderr.on('data', d => (err += d));
    py.on('close', code => {
      if (code !== 0) return reject(new Error(err || `exit ${code}`));
      try { resolve(JSON.parse(out.trim())); }
      catch (e) { reject(new Error(`parse failed: ${e.message}`)); }
    });
  });
}

// 자막 추출 → [{text, start, duration}]
async function fetchTranscript(videoId) {
  const r = await runPy('fetch', videoId);
  if (!r.success) throw new Error(r.error);
  return r.captions;
}

// 영어 자막 존재 여부 (검색 필터용). 실패 시 false로 간주.
async function hasEnglishTranscript(videoId) {
  try {
    const r = await runPy('check', videoId);
    return r.success && r.hasEnglish;
  } catch { return false; }
}

module.exports = { fetchTranscript, hasEnglishTranscript };
```

### 단계 3 — `transcript-practice` 라우트 교체

`backend/routes/youtube.js` 의 `GET /transcript-practice/:videoId` 에서 기존 3단계 폴백 전체를 youtube-transcript-api 단일 경로로 교체:

```javascript
const { fetchTranscript } = require('../services/transcript-api');

try {
  console.log('🚀 youtube-transcript-api로 자막 추출...');
  const captions = await fetchTranscript(videoId);   // [{text, start, duration}]
  let sentences = mergeIntoSentences(
    captions.map(c => ({ text: c.text, start: c.start, dur: c.duration }))
  );
  if (useSpacy === 'true') sentences = await improveSentencesWithSpacy(sentences);

  return res.json({
    sentences,
    totalDuration: sentences.length ? sentences[sentences.length - 1].end : 0,
    processed: true,
    source: useSpacy === 'true' ? 'youtube-transcript-api+spacy' : 'youtube-transcript-api',
    spacyImproved: useSpacy === 'true',
  });
} catch (e) {
  // 방안 A에서는 검색 단계에서 이미 자막 있는 영상만 노출하므로 여기 도달은 드묾.
  // (옵션) 방안 B를 켰다면 여기서 Whisper 폴백으로 분기 → §6 참고.
  return res.status(404).json({
    error: 'No English subtitles available',
    details: '이 영상은 영어 자막이 없습니다.',
    videoId,
  });
}
```

> `mergeIntoSentences` 와 `improveSentencesWithSpacy` 는 이미 `youtube.js`에 구현돼 있어 그대로 쓴다. 입력 키만 `{text, start, dur}` 로 맞춰주면 된다.

### 단계 4 — 검색 필터 (자막 있는 영상만 노출) ★핵심

`backend/routes/youtube.js` 의 `GET /search` 를 두 층으로 보강한다.

**1층 — 검색 파라미터 (이미 주석으로 존재, line ~558):**

```javascript
const searchResponse = await youtube.search.list({
  part: 'snippet', q: query, type: 'video',
  maxResults: parseInt(maxResults) * 2,
  order: 'relevance',
  videoDuration: 'medium',
  videoCaption: 'closedCaption',   // ← 주석 해제: 자막 있는 영상 위주
});
```

**2층 — 정확 검증 (병렬, 영어 자막 없는 영상 제거):**

```javascript
const { hasEnglishTranscript } = require('../services/transcript-api');

// filteredVideos 정렬까지 끝난 뒤, 노출 직전에 영어 자막 검증
const checked = await Promise.all(
  filteredVideos.map(async (v) => ({ v, ok: await hasEnglishTranscript(v.id) }))
);
const captioned = checked.filter(c => c.ok).map(c => c.v);

const finalVideos = captioned.slice(0, parseInt(maxResults));
res.json({ videos: finalVideos, totalFound: captioned.length, captionGuaranteed: true });
```

> 검증은 영상당 가벼운 1회 요청이라 `Promise.all` 병렬로 충분히 빠르다. 결과를 짧게 캐시(메모리/Redis)하면 같은 검색의 반복 비용도 줄인다.
> UX 대안(A-2, 선택 시 지연 검증)을 택하면 이 2층을 생략하고, 프론트엔드가 영상 선택 시 `hasEnglishTranscript` 결과로 안내한다.

### 단계 5 — 의존성 설치

**로컬:**
```bash
pip3 install youtube-transcript-api
```

**Dockerfile** (Python 의존성 설치 부분에 추가):
```dockerfile
RUN pip3 install --no-cache-dir youtube-transcript-api
```

**nixpacks.toml** (Render):
```toml
[phases.setup]
# 기존 pip 설치 목록에 youtube-transcript-api 추가
```

---

## 3. 테스트 체크리스트

```bash
# 1) 자막 있는 영상 — 스크립트 생성
curl "http://localhost:5030/api/youtube/transcript-practice/8jPQjjsBbIc" | jq '.source, (.sentences | length)'
# 기대: "youtube-transcript-api+spacy", 문장 수 > 0

# 2) 검색 — 자막 있는 영상만 노출되는가
curl "http://localhost:5030/api/youtube/search?query=ted%20talk" | jq '.captionGuaranteed, (.videos | length)'
# 기대: true, 결과 전부 영어 자막 보유

# 3) 자막 없는 영상 — 명확한 404 (방안 A)
curl "http://localhost:5030/api/youtube/transcript-practice/9bZkp7q19f0" | jq '.error'
# 기대: "No English subtitles available"

# 4) spaCy 비활성화
curl "http://localhost:5030/api/youtube/transcript-practice/8jPQjjsBbIc?useSpacy=false" | jq '.source'
# 기대: "youtube-transcript-api"
```

검증 포인트:
- [ ] 검색 결과가 모두 영어 자막 보유 영상인가 (선택 → 연습이 항상 성공)
- [ ] 문장이 자연스러운 단위로 분리되는가 (너무 길거나 조각나지 않는가)
- [ ] `start`/`end` 타이밍이 영상과 맞는가 (TTS·하이라이트 동기화)
- [ ] 자막 없는 영상은 검색 목록에서 제외되는가
- [ ] 프론트엔드 `ScriptPracticeScreen`이 응답을 그대로 렌더하는가

---

## 4. 단계별 우선순위 (권장 진행 순서)

1. **단계 1~3, 5** — youtube-transcript-api로 스크립트 생성을 즉시 복구. 이 시점에서 자막 있는 영상은 모두 동작한다 (MVP).
2. **단계 4** — 검색 필터로 "자막 있는 영상만 노출" → 사용자가 막히는 경우 제거.
3. (옵션) **§6** — 자막 없는 영상까지 확장하고 싶을 때만 Whisper 폴백 추가.

---

## 5. 향후 개선 (선택)

- **GPT 후처리**: 자동 생성 자막의 구두점·대소문자를 GPT로 정제해 학습 품질 향상 (`routes/translate.js`의 OpenAI 클라이언트 재사용).
- **난이도 표시**: 문장별 단어 수/희귀 단어 기반 난이도 라벨.
- **프록시**: 클라우드 배포 시 IP 차단 대비 프록시 옵션을 `fetch_transcript.py`에 추가.
- **자막 검증 캐시**: `hasEnglishTranscript` 결과를 메모리/Redis에 캐시해 검색 반복 비용 절감.

---

## 6. (옵션) 방안 B — Whisper 폴백

자막 없는 영상까지 학습 대상으로 넓히려는 경우에만 추가한다. 방안 A에서는 불필요.

**6.1 라우트 폴백 분기** — 단계 3의 `catch` 에서 404 대신 Whisper로 분기:

```javascript
} catch (e) {
  console.log('🎙️ 자막 없음 → Whisper 폴백');
  // 1) 캐시 확인
  if (await s3Service.whisperCacheExists(videoId)) {
    return res.json({ ...(await s3Service.getWhisperCache(videoId)), source: 'whisper-cache' });
  }
  // 2) 오디오 추출(android) → 3) Whisper 전사+spaCy 분할 → 4) 캐시 저장
  const audio = await extractAudioWithYtDlp(videoId, audioDir);
  const sentences = await transcribeAndSegment(audio.audioPath);
  await s3Service.uploadWhisperCache(videoId, { sentences });
  return res.json({ sentences, source: 'whisper' });
}
```

> `whisper.js`에 이미 전사 로직이 있다. 라우트의 전사+spaCy 분할 부분을 `transcribeAndSegment(audioPath)` 함수로 추출(refactor)해 양쪽에서 공유한다.

**6.2 yt-dlp 오디오 클라이언트 수정** — `services/youtube-captions.js` 의 `extractAudioWithYtDlp`:

```diff
- '--extractor-args "youtube:player_client=web,mweb"',
+ '--extractor-args "youtube:player_client=android"',
```

실측상 `web,mweb`는 SABR로 실패, **`android`는 오디오 추출 성공**. 견고하게 하려면 폴백 체인(`android` → `ios` → `web`)으로 순차 시도.

**6.3 캐싱** — Whisper는 유료이므로 결과 캐싱이 **필수**. `s3Service.uploadWhisperCache` / `getWhisperCache` 이미 존재.
