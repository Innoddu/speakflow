# SpeakFlow 아키텍처 다이어그램

> 현재 코드 기준 전체 흐름과 구조. (captions-only 전략 적용 후)
> Mermaid 다이어그램은 GitHub·VS Code 등에서 렌더링됩니다.

> 작성일: 2026-06-21

---

## 1. 한눈에 보는 전체 구조

```mermaid
flowchart TB
    subgraph FE["📱 speakflow-frontend (React Native + Expo)"]
        Screens["screens/<br/>Home · Search · VideoDetail · ScriptPractice · History"]
        Svcs["services/<br/>youtubeService · whisperService · historyService"]
        Comps["components/<br/>VideoPlayer · AudioPlayer · WebAlert"]
        Screens --> Svcs
        Screens --> Comps
    end

    subgraph BE["🖥️ speakflow-backend (Express API)"]
        RY["routes/youtube.js<br/>/search · /video · /audio"]
        RW["routes/whisper.js<br/>/youtube-subtitles"]
        RH["routes/history.js<br/>/history"]
        ST["services/transcript-api.js"]
        SC["services/youtube-captions.js"]
        SS["services/s3Service.js"]
        PY["scripts/fetch_transcript.py"]
        RY --> ST
        RY --> SC
        RY --> SS
        RW --> ST
        ST --> PY
    end

    subgraph EXT["☁️ 외부 서비스 / 도구"]
        YT["YouTube Data API v3"]
        YTA["youtube-transcript-api<br/>(Python)"]
        YTDLP["yt-dlp<br/>(android client)"]
        SPACY["spaCy<br/>(Python)"]
        S3["AWS S3"]
    end

    Svcs -->|HTTP REST| RY
    Svcs -->|HTTP REST| RW
    Svcs -->|HTTP REST| RH

    RY --> YT
    PY --> YTA
    SC --> YTDLP
    RW --> SPACY
    SS --> S3
```

---

## 2. 사용자 흐름 (화면 이동)

```mermaid
flowchart LR
    Home["🏠 Home"] --> Search["🔍 Search<br/>영상 검색"]
    Search --> List["자막 있는<br/>영상 목록"]
    List --> Detail["📺 VideoDetail<br/>영상 상세"]
    Detail --> Practice["✍️ ScriptPractice<br/>문장별 연습"]
    Practice --> Play["문장 클릭<br/>→ 원본 음성 재생 🔊"]

    Home --> History["🕘 History<br/>학습 기록"]
    History --> Detail
    Practice -. 자동 저장 .-> History
```

---

## 3. 핵심 기능: 스크립트 생성 + 연습 (시퀀스)

```mermaid
sequenceDiagram
    autonumber
    participant U as 사용자
    participant FE as 프론트엔드
    participant BE as 백엔드
    participant YTA as youtube-transcript-api
    participant SP as spaCy
    participant YD as yt-dlp / S3

    U->>FE: 영상 선택 (ScriptPractice 진입)

    Note over FE,BE: ① 스크립트(자막) 생성
    FE->>BE: GET /whisper/youtube-subtitles/:id
    BE->>YTA: 영어 자막 추출 (fetch)
    YTA-->>BE: [{ text, start, duration }]
    BE->>SP: 문장 경계 분할
    SP-->>BE: 문장 단위 스크립트
    BE-->>FE: { sentences[] }

    Note over FE,YD: ② 원본 오디오 준비
    FE->>BE: GET /youtube/audio/:id
    BE->>YD: S3 캐시 확인 → 없으면 yt-dlp(android) 추출 → S3 업로드
    YD-->>BE: audioUrl
    BE-->>FE: { audioUrl }

    Note over U,FE: ③ 연습
    U->>FE: 문장 클릭
    FE->>FE: 해당 구간(start~end) 원본 음성 재생 🔊
```

---

## 4. 검색 필터 — "자막 있는 영상만" (captions-only 핵심)

```mermaid
sequenceDiagram
    autonumber
    participant FE as 프론트엔드
    participant BE as /youtube/search
    participant YT as YouTube Data API
    participant YTA as youtube-transcript-api

    FE->>BE: GET /search?query=
    BE->>YT: search.list (videoCaption=closedCaption, medium)
    YT-->>BE: 후보 영상들
    BE->>YT: videos.list (길이·메타데이터)
    BE->>BE: 10분 이하 필터 + 관련도 정렬
    BE->>YTA: 각 영상 영어 자막 존재 검증 (병렬, list)
    YTA-->>BE: hasEnglish = true / false
    BE-->>FE: 자막 있는 영상만 반환<br/>(captionGuaranteed: true)
```

> 이 2층 필터(검색 파라미터 + 자막 검증) 덕분에 **사용자에게 보이는 모든 영상은 스크립트 생성이 보장**된다.

---

## 5. API 엔드포인트 맵

```mermaid
flowchart LR
    subgraph Active["✅ 앱에서 사용 중 (전부 활성)"]
        S1["GET /youtube/search"]
        S2["GET /youtube/video/:id"]
        S3e["GET /youtube/audio/:id"]
        S4["GET /whisper/youtube-subtitles/:id"]
        S5["GET·POST /history*"]
        S6["GET /health"]
        S7["POST /translate (한글 번역)"]
        S8["POST /translate/keywords (단어/구)"]
    end
```

> `/translate`·`/translate/keywords`는 스크립트 카드의 **왼쪽 스와이프(번역 → 단어 학습)** 에 사용되며 **Google Gemini**로 처리된다. 미사용이던 `tts`·`auth` 라우트는 제거됨.

---

## 6. 디렉터리 구조 (현재)

```
speakflow/
├── docs/                              # 설계·분석·다이어그램 문서
│   ├── README.md
│   ├── architecture-diagram.md        # 이 문서
│   ├── script-generation-analysis.md
│   ├── script-generation-implementation.md
│   └── swipe-translation-implementation.md
│
├── speakflow-backend/
│   └── backend/
│       ├── server.js                  # Express 진입점
│       ├── routes/
│       │   ├── youtube.js             # 검색 · 영상 · 오디오
│       │   ├── whisper.js             # 자막→문장 스크립트 생성
│       │   ├── history.js             # 학습 기록
│       │   └── translate.js           # 번역 · 단어추출 (Gemini)
│       ├── services/
│       │   ├── transcript-api.js      # youtube-transcript-api 래퍼
│       │   ├── youtube-captions.js    # yt-dlp 오디오 추출
│       │   └── s3Service.js           # AWS S3
│       └── scripts/
│           └── fetch_transcript.py    # 영어 자막 추출/검증 (Python)
│
└── speakflow-frontend/
    ├── App.tsx                        # 네비게이션 (Stack)
    └── src/
        ├── screens/                   # Home·Search·VideoDetail·ScriptPractice·History
        ├── services/                  # youtubeService·whisperService·historyService
        ├── components/                # VideoPlayer·AudioPlayer·WebAlert
        └── config/api.ts              # 백엔드 URL 설정
```

---

## 7. 데이터 흐름 요약

| 단계 | 화면/엔드포인트 | 핵심 외부 의존 |
|------|----------------|----------------|
| 영상 검색 | `/youtube/search` | YouTube Data API + youtube-transcript-api(검증) |
| 영상 상세 | `/youtube/video/:id` | YouTube Data API |
| 스크립트 생성 | `/whisper/youtube-subtitles/:id` | youtube-transcript-api + spaCy |
| 오디오 준비 | `/youtube/audio/:id` | yt-dlp(android) + AWS S3 |
| 학습 기록 | `/history*` | 로컬 JSON (`data/history`) |
