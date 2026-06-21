# 스와이프 학습 카드 구현 (3단계)

> 스크립트 카드를 **왼쪽으로 스와이프**하면 단계가 넘어가는 학습 카드.
> 영어 문장 → 한국어 번역 → 핵심 단어/구(영+한). 오른쪽 스와이프로 복귀.

> 작성일: 2026-06-21 · 상태: **구현 완료** ✅

---

## 0. 동작

```
[0] 영어 문장      --- ← 스와이프 --->   [1] 한국어 번역   --- ← 스와이프 --->   [2] 단어/구 카드
                  <--- → 스와이프 ---                    <--- → 스와이프 ---

   탭(클릭) → 해당 구간 원본 음성 재생 (모든 단계에서 가능)
```

- 카드별로 보기 상태(0/1/2)를 독립 관리
- 번역·단어는 **처음 진입할 때 한 번만** API 호출 후 캐시
- 하단 점(●○○)으로 현재 단계 표시

---

## 1. 백엔드 — 엔드포인트 2개 (OpenAI)

| 단계 | 엔드포인트 | 구현 | 응답 |
|------|-----------|------|------|
| 번역 | `POST /api/translate` | Google Gemini (`gemini-2.5-flash`) | `{ success, translatedText }` |
| 단어/구 | `POST /api/translate/keywords` | Gemini (JSON 모드) | `{ success, items: [{term, meaning}] }` |

`/keywords` 시스템 프롬프트: *"학습자가 공부할 핵심 단어·구(최대 6개)를 골라 영어 원형과 문맥상 한국어 의미를 JSON으로 반환. 구동사·숙어 우선"*. `responseMimeType: application/json`으로 파싱 안정성 확보.

> 모델은 `GEMINI_MODEL` 환경변수로 교체 가능, 키는 `GEMINI_API_KEY`(AI Studio 무료 발급). 무료 티어로 비용 0.

실측:
```
"...the thermometer read minus 40 degrees."
 → visiting / 방문하다 · thermometer / 온도계 · minus 40 degrees / 마이너스 40도
```

> 두 기능 모두 LLM(Google Gemini 무료 티어) 사용. 문맥 반영 번역·구동사 추출에 적합하고 비용 0. 공통 에러 처리는 `handleGeminiError()`로 통합.

---

## 2. 프론트엔드 — `ScriptPracticeScreen.tsx`

### 상태
```tsx
type CardView = 0 | 1 | 2;                              // 0=영어 1=번역 2=단어
type KeywordItem = { term: string; meaning: string };

const [cardView, setCardView]   = useState<{[i:number]: CardView}>({});
const [translations, setTrans]  = useState<{[i:number]: string}>({});       // 번역 캐시
const [keywords, setKeywords]   = useState<{[i:number]: KeywordItem[]}>({}); // 단어 캐시
```

### 스와이프 (탭과 공존)
- 각 카드를 `PanGestureHandler`로 감싸고 `activeOffsetX={[-15,15]}` → **가로 15px 이상 끌 때만** 스와이프로 판정. 짧은 탭은 `onPress`(음성 재생)로, 세로 동작은 `ScrollView` 스크롤로 전달.
- `translationX < -50` → `swipeLeft`(다음 단계), `> 50` → `swipeRight`(이전 단계).
- `swipeLeft`에서 단계 1 진입 시 `fetchTranslation`, 단계 2 진입 시 `fetchKeywords` (캐시에 없을 때만).

### 렌더 (보기 상태별 교체)
- `view 0`: 영어 문장 (재생 중이면 보라색 강조)
- `view 1`: 한국어 번역 (연파랑 카드 + 초록 보더). 로딩 중 스피너.
- `view 2`: 단어/구 목록 `term — meaning` (연주황 카드 + 주황 보더). 로딩 중 스피너.
- 하단 점으로 단계 표시.

---

## 3. 설계 결정

| 항목 | 결정 | 이유 |
|------|------|------|
| 단계 표시 | 교체(뒤집기) + 단계 점 | 카드가 깔끔, 진행 단계 직관적 |
| 호출 시점 | 단계 진입 시 on-demand | 전체 사전 호출은 OpenAI 과다 |
| 캐시 | index별 메모리 저장 | 재호출 방지(비용·속도) |
| 모델 | Google Gemini `gemini-2.5-flash` (무료) | 문맥 번역·구동사 추출 우수, 비용 0 |
| 탭 vs 스와이프 | `activeOffsetX`로 분리 | 음성 재생과 제스처 공존 |

---

## 4. 변경 파일

| 파일 | 변경 |
|------|------|
| `backend/routes/translate.js` | `/keywords` 추가, 공통 에러 처리 정리 |
| `frontend/.../ScriptPracticeScreen.tsx` | 3단계 스와이프·캐시·단어 카드 렌더 |

### 향후 개선(선택)
- 번역/단어를 로컬에 영구 캐시 → 앱 재실행에도 유지
- 단어 카드에 발음기호·예문 추가
- 슬라이드 전환 애니메이션(`Animated`)으로 손맛 추가
