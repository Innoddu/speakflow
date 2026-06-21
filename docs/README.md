# SpeakFlow 문서

SpeakFlow 프로젝트의 설계·분석·구현 문서를 관리하는 폴더입니다.

## 문서 목록

### 스크립트 생성 (자막 추출)

| 문서 | 내용 |
|------|------|
| [architecture-diagram.md](./architecture-diagram.md) | 전체 흐름·구조 다이어그램 (시스템/사용자흐름/시퀀스/디렉터리) |
| [script-generation-analysis.md](./script-generation-analysis.md) | 자막 추출 방법 비교 분석 — 현재 실패 원인, 방법별 실측 결과, 방안 A(자막 있는 영상만) vs 방안 B(Whisper 폴백) |
| [script-generation-implementation.md](./script-generation-implementation.md) | 권장 방안 A(youtube-transcript-api 단일 경로 + 검색 필터)의 단계별 구현 가이드 |
| [swipe-translation-implementation.md](./swipe-translation-implementation.md) | 스크립트 카드 왼쪽 슬라이드 → 한국어 해석(교체 방식) 구현 계획 |

> **현재 결정:** 방안 A — *자막 있는 영상만 대상*. 검색 단계에서 영어 자막 보유 영상만 노출해, 사용자가 선택하는 모든 영상의 스크립트 생성을 보장한다. Whisper 폴백(방안 B)은 향후 옵션.

## 관련 문서 (다른 위치)

| 문서 | 위치 | 내용 |
|------|------|------|
| 모노레포 개요 | [../README.md](../README.md) | 프로젝트 설명·전체 폴더 구조 |
| 프로젝트 구조 상세 | [../speakflow-backend/PROJECT_STRUCTURE.md](../speakflow-backend/PROJECT_STRUCTURE.md) | API 엔드포인트·모듈 상세 |
| 백엔드 가이드 | [../speakflow-backend/README.md](../speakflow-backend/README.md) | 설치·배포 |
| OpenAI 설정 | [../speakflow-backend/OPENAI_SETUP.md](../speakflow-backend/OPENAI_SETUP.md) | OpenAI API 키 안내 |

## 작성 규칙

- 새 설계·분석 문서는 이 `docs/` 폴더에 추가하고, 위 **문서 목록** 표에 한 줄로 등록한다.
- 문서명은 `주제-종류.md` 형식 (예: `script-generation-analysis.md`).
- 한국어로 작성하며, 결정의 **근거**(실측·테스트 결과)를 함께 남긴다.
