# 스크립트 생성 분석 — 자막 추출 방법 비교

> 목표: 사용자가 YouTube 영상을 선택하면, 그 영상의 영어 스크립트를 **한 문장씩** 생성해 영어 학습을 돕는다.

> 작성일: 2026-06-21 · 검증 환경: macOS, yt-dlp 2025.06.30, youtube_transcript_api 1.1.0

---

## 1. 한 줄 요약

현재 `transcript-practice` 엔드포인트의 자막 추출 3단계(yt-dlp → YouTube Data API → scraper)가 **모두 실패**한다. 원인은 2025년 이후 YouTube의 봇 차단 정책 변화다. 실측 결과 **youtube-transcript-api**(Python)가 가장 안정적이다. 프로젝트 목표를 고려할 때 **자막 있는 영상만 대상으로 스크립트를 생성하는 방안 A**를 권장하며, 자막 없는 영상까지 넓히려면 Whisper 폴백(방안 B)을 옵션으로 둔다. (§5 참고)

---

## 2. 현재 동작 방식

`GET /api/youtube/transcript-practice/:videoId` 는 3단계 폴백이다.

```
1. yt-dlp 자막 추출 (services/youtube-captions.js)
      │  --cookies-from-browser chrome
      │  --extractor-args "youtube:player_client=web,mweb"
      ▼ 실패 시
2. YouTube Data API v3 — captions.list + captions.download
      ▼ 실패 시
3. youtube-captions-scraper 라이브러리
```

자막을 얻으면:

- `mergeIntoSentences()` 로 자막 조각을 문장으로 병합
- (옵션) `improveSentencesWithSpacy()` 로 spaCy가 문장 경계 재정리
- `{ sentences: [{ text, start, end, duration }], totalDuration, source }` 형태로 반환

프론트엔드(`ScriptPracticeScreen.tsx`)는 이 `sentences` 배열을 받아 한 문장씩 카드로 표시하고, TTS·번역·따라 말하기 기능을 붙인다.

---

## 3. 왜 모두 실패하는가 (실측 기반)

### 3.1 yt-dlp 자막 추출 — 실패

```
WARNING: cannot decrypt v10 cookies: no key found
Extracted 0 cookies from chrome (2068 could not be decrypted)
WARNING: Some mweb client subtitles require a PO Token which was not provided.
         They will be discarded since they are not downloadable as-is.
```

- **쿠키 복호화 실패**: macOS Keychain 권한 문제로 `--cookies-from-browser chrome` 가 쿠키를 0개 가져온다. (서버 환경에는 애초에 브라우저가 없어 이 옵션 자체가 무의미)
- **PO Token 요구**: 2025년부터 YouTube가 `web`/`mweb` 클라이언트에 PO Token 없이는 자막을 주지 않는다.
- **SABR 스트리밍**: `web` 클라이언트 포맷이 URL 없이 막힌다.

### 3.2 YouTube Data API v3 `captions.download` — 실패

```
"youtubeApi": "Login Required."
```

- `captions.download` 는 API Key가 아니라 **영상 소유자의 OAuth2 인증**을 요구한다. 제3자 영상의 자막은 이 방법으로 받을 수 없다. 구조적으로 불가능.

### 3.3 youtube-captions-scraper — 실패

- YouTube watch 페이지 HTML을 파싱하는 방식이라, YouTube가 프론트엔드 구조를 바꿀 때마다 깨진다. 현재 깨진 상태.

---

## 4. 방법별 비교 (실측)


| 방법                                   | 결과  | 타이밍 | 비용    | 인증/토큰       | 비고                                     |
| ------------------------------------ | --- | --- | ----- | ----------- | -------------------------------------- |
| **youtube-transcript-api** (Python)  | ✅   | O   | 무료    | 불필요         | YouTube 내부 timedtext API 직접 호출. 가장 안정적 |
| yt-dlp 자막 (`web,mweb`)               | ❌   | —   | 무료    | PO Token 필요 | 현재 코드. 봇 차단                            |
| yt-dlp 자막 (`ios`)                    | ❌   | —   | 무료    | —           | `--skip-download` 시 포맷 오류              |
| YouTube Data API `captions.download` | ❌   | —   | 쿼터    | **OAuth2**  | 소유자 영상만 가능                             |
| youtube-captions-scraper             | ❌   | —   | 무료    | 불필요         | HTML 파싱, 깨짐                            |
| **Whisper 전사** (오디오 → STT)           | ✅   | O   | 유료($) | OpenAI Key  | 자막 없는 영상도 가능. 폴백용                      |
| yt-dlp 오디오 (`android`)               | ✅   | —   | 무료    | —           | Whisper 입력용. 현재 코드의 `web,mweb`는 실패     |


검증 명령 예시:

```bash
# ✅ youtube-transcript-api — 즉시 작동
python3 -c "from youtube_transcript_api import YouTubeTranscriptApi; \
print(YouTubeTranscriptApi.get_transcript('8jPQjjsBbIc', languages=['en'])[:3])"
# → [{'text': 'A few years ago,...', 'start': 13.24, 'duration': 2.56}, ...]

# ✅ yt-dlp 오디오 — android 클라이언트는 성공 (Whisper 폴백용)
yt-dlp -f "bestaudio/best" --extractor-args "youtube:player_client=android" \
  -o "out.%(ext)s" "https://www.youtube.com/watch?v=8jPQjjsBbIc"
```

---

## 5. 권장 아키텍처

두 가지 후보가 있다. 프로젝트 목표(영어 학습 — 정확한 스크립트가 핵심)를 고려하면 **방안 A(자막 있는 영상만)** 를 권장한다.

### 방안 A — 자막 있는 영상만 대상 (권장, 단순)

자막이 있는 영상만 검색·노출하고, 스크립트는 **youtube-transcript-api 한 가지** 로만 생성한다. Whisper 폴백이 필요 없어 구조가 단순하고 비용이 0이며, **사용자에게 보이는 모든 영상은 100% 스크립트 생성 성공**이 보장된다.

```
[검색]  GET /api/youtube/search
│
├─ 1층(서버 필터): YouTube search.list 에 videoCaption='closedCaption'
│                   → 자막 있는 영상 위주로 1차 압축 (무료·즉시)
│
└─ 2층(정확 검증): 결과 각 영상을 youtube-transcript-api list_transcripts 로
                   영어 자막 존재 확인 → 없는 영상 제거 (영상당 가벼운 1회 요청, 병렬)
   → 사용자에게는 "스크립트 생성이 보장된 영상"만 노출

[연습]  GET /api/youtube/transcript-practice/:videoId
│
└─ youtube-transcript-api 로 자막 추출 → spaCy 문장 분할
   → {text, start, end, duration}[] 반환
```

**필터 적용 시점 — UX 선택:**

| 방식 | 동작 | 장점 | 단점 |
|------|------|------|------|
| A-1. 검색 후 일괄 검증 (권장) | 검색 결과를 병렬 검증해 자막 있는 것만 목록 표시 | 보이는 영상은 항상 성공 | 검색이 약간 느려짐(병렬화로 완화) |
| A-2. 선택 시 지연 검증 | 전부 노출, 선택 시 확인 → 없으면 안내 | 검색 빠름 | 사용자가 가끔 막힘 |

> ⚠️ 1층 `videoCaption='closedCaption'` 필터는 **수동 업로드 자막** 위주라 자동생성 자막만 있는 영상을 놓칠 수 있다. 그래서 2층 `list_transcripts` 검증이 실질적 보증 장치다. (실측: `list_transcripts`가 manual/auto 영어 자막을 정확히 구분)

### 방안 B — Whisper 폴백 포함 (견고하지만 복잡)

자막 없는 영상도 학습하게 하려면, 자막이 없을 때 Whisper로 보완한다.

```
GET /api/youtube/transcript-practice/:videoId
├─ [1차] youtube-transcript-api → spaCy 문장 분할
└─ [폴백] 자막 없음 → yt-dlp 오디오 추출(android) → OpenAI Whisper → spaCy → S3 캐시
```

- **장점**: 모든 영상 학습 가능.
- **단점**: Whisper 유료($0.006/분)·느림, 오디오 추출 의존성, 캐싱 관리 필요.

### 두 방안 비교

| 항목 | A. 자막 있는 영상만 | B. Whisper 폴백 포함 |
|------|:---:|:---:|
| 구현 복잡도 | 낮음 | 높음 |
| 비용 | 무료 | Whisper 과금 |
| 대상 영상 범위 | 자막 있는 영상만 | 모든 영상 |
| 스크립트 정확도 | 높음(실제 자막) | 폴백은 STT 오차 가능 |
| 성공 보장 | 노출 영상 100% | 거의 100% |

**권장: 방안 A로 시작.** 학습용 콘텐츠(TED·뉴스·교육 채널)는 대부분 자막이 있어 영상 범위 제약이 크지 않고, 정확한 스크립트가 학습 품질에 직결된다. 추후 수요가 있으면 방안 B의 Whisper를 옵션으로 덧붙일 수 있다.

### 공통 사항

- 두 방안 모두 결과를 spaCy로 문장 분할해 일관된 `sentences` 배열을 만든다 → 프론트엔드 변경 불필요.
- spaCy·S3 캐싱 등 기존 자산을 재사용한다.

---

## 6. 주의 사항 / 리스크


| 항목                | 내용                                                                     | 대응                                                     |
| ----------------- | ---------------------------------------------------------------------- | ------------------------------------------------------ |
| **클라우드 IP 차단**    | youtube-transcript-api는 Railway/Render 등 데이터센터 IP에서 YouTube에 차단당할 수 있다 | 프록시 사용, 또는 차단 시 Whisper 폴백으로 자동 전환                     |
| **Whisper 비용**    | OpenAI Whisper는 분당 과금($0.006/분)                                        | S3·로컬 캐시로 같은 영상 재전사 방지 (이미 구현됨)                        |
| **yt-dlp 버전 노후화** | YouTube 변경으로 추출 깨짐                                                     | yt-dlp를 최신으로 유지(`yt-dlp -U`), `player_client` 폴백 체인 구성 |
| **자동 생성 자막 품질**   | 자동 자막은 구두점·고유명사 부정확                                                    | spaCy 문장 분할로 일부 보정, 필요 시 GPT 후처리(선택)                   |
| **Python 의존성**    | 서버에 `youtube-transcript-api` 설치 필요                                     | Dockerfile / nixpacks.toml에 pip 설치 추가                  |


---

## 7. 결론

- 현재 3단계 폴백은 2025년 YouTube 정책 변화로 **구조적으로 사용 불가**다.
- **권장: 방안 A — 자막 있는 영상만 대상.** 추출은 **youtube-transcript-api 단일 경로**로 하고, 검색 단계에서 `videoCaption` 필터 + `list_transcripts` 검증으로 자막 있는 영상만 노출한다. → Whisper 불필요, 비용 0, 노출 영상 100% 성공.
- 자막 없는 영상까지 학습하려는 수요가 생기면 **방안 B의 Whisper 폴백**을 옵션으로 추가한다.
- 문장 분할(spaCy)과 캐싱 자산은 그대로 재사용한다.
- 구체적 구현 단계는 [script-generation-implementation.md](./script-generation-implementation.md) 참고.

