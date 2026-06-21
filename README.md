# SpeakFlow

YouTube 영상 기반 AI 영어 스피킹 연습 플랫폼 모노레포입니다.

## 프로젝트 개요

SpeakFlow는 YouTube 영상을 활용해 영어 스피킹을 연습하는 AI 기반 학습 플랫폼입니다. 사용자는 YouTube 영상을 검색하고, AI가 자막/음성을 추출·문장 단위로 분할하면, 문장을 따라 말하며 자연스럽게 영어를 학습합니다.

### 주요 기능

| 기능 | 설명 |
|------|------|
| YouTube 영상 검색 | 10분 이하 학습용 영상 검색 및 메타데이터 조회 |
| 자막 추출 | yt-dlp / YouTube API / 스크래퍼 다단계 폴백으로 자막 수집 |
| AI 음성 전사 | OpenAI Whisper로 음성 → 타이밍 포함 텍스트 변환 |
| 문장 분할 | spaCy NLP(Python) + Natural.js(폴백)으로 자연스러운 문장 경계 감지 |
| TTS 생성 | OpenAI TTS로 문장별 원어민 음성 생성 |
| 한국어 번역 | OpenAI GPT로 영→한 번역 |
| 오디오 캐싱 | AWS S3 + 로컬 파일시스템 이중 캐시로 빠른 재접근 |
| 학습 기록 | 연습한 영상 이력 관리 |

---

## 전체 아키텍처

```
[speakflow-frontend]  React Native + Expo
        │
        │ HTTP REST API
        ▼
[speakflow-backend]   Express.js API 서버
        │
        ├── YouTube Data API v3   (영상 검색·메타데이터·자막)
        ├── yt-dlp / ytdl-core    (자막·오디오 추출)
        ├── OpenAI Whisper        (음성 전사)
        ├── OpenAI TTS            (텍스트 음성 변환)
        ├── OpenAI GPT            (번역)
        ├── spaCy (Python)        (문장 분할)
        └── AWS S3                (오디오·전사 캐시)
```

---

## 폴더 구조

```
speakflow/                              # 모노레포 루트
├── README.md                           # 이 파일
│
├── speakflow-backend/                  # Express.js API 서버 (Node.js)
│   ├── backend/                        # 서버 소스 코드
│   │   ├── server.js                   # Express 앱 진입점
│   │   ├── routes/                     # API 라우터
│   │   │   ├── youtube.js              # YouTube 검색·자막·오디오
│   │   │   ├── whisper.js              # OpenAI Whisper 전사·캐싱
│   │   │   ├── tts.js                  # TTS 음성 생성
│   │   │   ├── translate.js            # GPT 번역
│   │   │   ├── history.js              # 학습 기록 CRUD
│   │   │   └── auth.js                 # 인증 (플레이스홀더)
│   │   ├── services/                   # 비즈니스 로직
│   │   │   ├── s3Service.js            # AWS S3 업로드·조회
│   │   │   └── youtube-captions.js     # yt-dlp 자막·오디오 추출
│   │   ├── scripts/                    # 유틸리티 스크립트
│   │   │   ├── aws-setup/              # S3 버킷 설정 스크립트
│   │   │   ├── tests/                  # AWS 연결 테스트
│   │   │   └── upload-cache-to-s3.js   # 로컬 캐시 → S3 업로드
│   │   ├── test/                       # 수동 검증 스크립트
│   │   ├── cache/whisper/              # Whisper 전사 JSON 캐시 (런타임 생성)
│   │   ├── data/history/               # 학습 기록 JSON (런타임 생성)
│   │   ├── public/audio/               # 추출 MP3 파일 (런타임 생성)
│   │   └── uploads/                    # Whisper 업로드 임시 파일
│   ├── Dockerfile                      # Node 20 + Python + spaCy + ffmpeg
│   ├── nixpacks.toml                   # Render 배포 설정
│   ├── railway.toml                    # Railway 배포 설정
│   ├── package.json
│   ├── README.md                       # 백엔드 상세 가이드
│   ├── OPENAI_SETUP.md                 # OpenAI API 설정 안내
│   └── PROJECT_STRUCTURE.md           # API 엔드포인트·모듈 상세 설명
│
└── speakflow-frontend/                 # React Native + Expo 앱
    ├── App.tsx                         # 네비게이션 루트 (Stack Navigator)
    ├── index.ts                        # 앱 진입점
    ├── src/
    │   ├── screens/                    # 화면 컴포넌트
    │   │   ├── HomeScreen.tsx          # 홈 (최근 기록·시작)
    │   │   ├── SearchScreen.tsx        # YouTube 영상 검색
    │   │   ├── VideoDetailScreen.tsx   # 영상 상세·자막 미리보기
    │   │   ├── ScriptPracticeScreen.tsx # 문장별 스피킹 연습 메인
    │   │   └── HistoryScreen.tsx       # 학습 기록 목록
    │   ├── services/                   # API 통신 레이어
    │   │   ├── youtubeService.ts       # YouTube 검색·자막 API 호출
    │   │   ├── whisperService.ts       # Whisper 전사 API 호출
    │   │   ├── ttsService.ts           # TTS 생성 API 호출
    │   │   └── historyService.ts       # 학습 기록 API 호출
    │   └── components/                 # 재사용 UI 컴포넌트
    │       ├── AudioPlayer.tsx         # 오디오 재생 컨트롤
    │       ├── VideoPlayer.tsx         # YouTube 영상 플레이어
    │       ├── VoiceSelector.tsx       # TTS 음성 선택
    │       └── WebAlert.tsx            # 웹 환경용 Alert 대체
    ├── assets/                         # 이미지·폰트 등 정적 리소스
    ├── android/                        # Android 네이티브 코드
    ├── ios/                            # iOS 네이티브 코드
    ├── app.json                        # Expo 앱 설정
    ├── eas.json                        # EAS Build 설정
    └── package.json
```

---

## 빠른 시작

### 백엔드

```bash
cd speakflow-backend

# 의존성 설치
npm install

# Python 의존성
pip3 install spacy yt-dlp
python3 -m spacy download en_core_web_sm

# 환경 변수 설정
cp backend/.env.example backend/.env
# .env 파일에 API 키 입력

# 개발 서버 실행
npm run dev
```

헬스체크: `http://localhost:5030/api/health`

### 프론트엔드

```bash
cd speakflow-frontend

# 의존성 설치
npm install

# 앱 실행
npm start        # Expo 개발 서버
npm run android  # Android 에뮬레이터
npm run ios      # iOS 시뮬레이터
npm run web      # 웹 브라우저
```

---

## 환경 변수 (`speakflow-backend/backend/.env`)

| 변수 | 설명 | 필수 |
|------|------|------|
| `PORT` | 서버 포트 (기본 `3000`) | — |
| `YOUTUBE_API_KEY` | Google YouTube Data API v3 키 | 권장 |
| `OPENAI_API_KEY` | OpenAI (Whisper / TTS / GPT) | 권장 |
| `AWS_ACCESS_KEY_ID` | AWS 액세스 키 | 선택 |
| `AWS_SECRET_ACCESS_KEY` | AWS 시크릿 키 | 선택 |
| `AWS_REGION` | S3 리전 (기본 `us-east-1`) | 선택 |
| `AWS_S3_BUCKET` | S3 버킷 이름 | 선택 |

---

## 기술 스택

| 영역 | 기술 |
|------|------|
| 백엔드 | Node.js 20, Express.js |
| AI / NLP | OpenAI Whisper, OpenAI TTS, OpenAI GPT, spaCy |
| 미디어 추출 | yt-dlp, ytdl-core, ffmpeg |
| 클라우드 | AWS S3 (SDK v3) |
| 외부 API | YouTube Data API v3 |
| 프론트엔드 | React Native, Expo SDK 53, TypeScript |
| 네비게이션 | React Navigation v7 (Native Stack) |
| 오디오 재생 | expo-av, expo-audio |
| 배포 (백엔드) | Docker, Railway, Render (Nixpacks) |
| 배포 (프론트엔드) | EAS Build, Netlify (Web) |

---

## 저장소

| 프로젝트 | GitHub |
|----------|--------|
| 백엔드 | [innoddu/speakflow](https://github.com/innoddu/speakflow) |
| 프론트엔드 | [Innoddu/speakflow-frontend](https://github.com/Innoddu/speakflow-frontend) |

## 상세 문서

- [설계·분석 문서 (docs/)](./docs/README.md) — 스크립트 생성 전략 등
- [프로젝트 구조 및 API 엔드포인트 상세](./speakflow-backend/PROJECT_STRUCTURE.md)
- [백엔드 설치·배포 가이드](./speakflow-backend/README.md)
- [OpenAI API 설정 안내](./speakflow-backend/OPENAI_SETUP.md)
