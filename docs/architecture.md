# 기술 스택 및 아키텍처

## 시스템 개요

두 사람이 하나의 기기를 사이에 두고 각자의 언어로 대화하면 실시간으로 번역해주는 앱. AI 에이전트가 대화 흐름을 분석해 팩트체크가 필요한 내용을 감지하면 하단 패널에 비동기로 알림을 표시한다.

---

## 기술 스택

### 프론트엔드

| 항목 | 기술 |
|------|------|
| 프레임워크 | React 19 + TypeScript 6 |
| 빌드 도구 | Vite 8 |
| 스타일 | CSS Custom Properties (UI 라이브러리 없음) |
| 아이콘 | Font Awesome 6 (CDN) |
| 폰트 | Google Fonts — Inter (CDN) |
| 위치 | Browser Geolocation API + Nominatim (OpenStreetMap) |

### 백엔드

| 항목 | 기술 |
|------|------|
| 프레임워크 | Python + FastAPI |
| 서버 | uvicorn |
| HTTP 클라이언트 | httpx (비동기) |
| 데이터 검증 | Pydantic v2 |

### 외부 API

| 구분 | 서비스 | 용도 |
|------|--------|------|
| 번역 | Upstage API (solar-pro2) | 항상 사용 |
| Mock 에이전트 | Upstage API (solar-pro2) | 단일 LLM 호출 팩트체크 (`USE_MOCK=true`) |
| 프로덕션 에이전트 | Upstage API (solar-pro2) + Tavily API | 웹 검색 기반 팩트체크 (`USE_MOCK=false`) |
| 위치 | Nominatim (OpenStreetMap) | 역지오코딩 (무료) |

---

## 전체 아키텍처

```
┌─────────────────────────────────────────────────────────────┐
│  Browser                                                    │
│                                                             │
│  ┌──────────────────────────────────────────────────────┐  │
│  │  React App (App.tsx)                                 │  │
│  │  - 대화 히스토리 상태 (Message[])                      │  │
│  │  - 언어 설정 (bottomLang)                             │  │
│  │  - 에이전트 상태 (status / result / reasoning)        │  │
│  │  - 사용자 위치 (userLocation)                         │  │
│  └──────────────────────────────────────────────────────┘  │
│                  │ fetch (api.ts)                           │
│  ┌───────────────┴──────────────────────────────────────┐  │
│  │  translate()          streamAgent()                   │  │
│  │  POST /api/translate  POST /api/agent/stream (SSE)   │  │
│  └───────────────────────────────────────────────────────┘  │
│                          │                                  │
│  Geolocation API ──→ Nominatim (역지오코딩)                  │
└─────────────────────────────────────────────────────────────┘
                           │ HTTP
┌─────────────────────────────────────────────────────────────┐
│  FastAPI Backend                                            │
│                                                             │
│  routers/translate.py        routers/agent.py              │
│         │                           │                       │
│         │ (항상)                     │ USE_MOCK?             │
│         ▼                    ┌──────┴────────┐             │
│      upstage                 ▼               ▼             │
│     .translate           upstage        solar_agent        │
│   (solar-pro2)          .stream_agent  .stream_agent       │
│                          (단일 호출)    (response+Tavily)   │
└─────────────────────────────────────────────────────────────┘
```

---

## 디렉토리 구조

```
├── frontend/
│   ├── src/
│   │   ├── App.tsx          # 메인 컴포넌트 — 전체 상태 관리
│   │   ├── services/
│   │   │   └── api.ts       # 백엔드 HTTP 클라이언트
│   │   └── index.css        # CSS 변수 + 전체 스타일
│   └── .env                 # VITE_API_URL
│
└── backend/
    ├── app/
    │   ├── main.py          # FastAPI 앱 초기화, CORS
    │   ├── models.py        # Pydantic 요청/응답 모델
    │   ├── routers/
    │   │   ├── translate.py # POST /api/translate
    │   │   └── agent.py     # POST /api/agent/stream
    │   └── services/
    │       ├── upstage.py       # 번역 + Mock 에이전트 (Upstage solar-pro2)
    │       └── solar_agent.py   # 프로덕션 에이전트 (Upstage + Tavily)
    └── .env                 # USE_MOCK, UPSTAGE_API_KEY, TAVILY_API_KEY
```

---

## 핵심 아키텍처 결정

### 번역과 에이전트의 독립 실행

번역과 에이전트는 서로를 기다리지 않는다. 사용자가 발화하면 두 요청이 동시에 발행되고, 번역 결과는 즉시 표시되며 에이전트 결과는 나중에 도착하는 대로 오버레이로 표시된다.

```
사용자 입력
    ├── POST /api/translate  →  (200~500ms) → 번역 표시
    └── POST /api/agent/stream  →  (수 초) → 팩트체크 비동기 표시
```

### 번역: REST / 에이전트: SSE

- 번역은 응답이 빠르고 단발성이므로 REST로 충분
- 에이전트는 처리 시간이 불규칙하고 "분석 중" 상태를 실시간으로 보여야 하므로 SSE 채택. 서버→클라이언트 단방향 스트림이므로 WebSocket보다 SSE가 적합

### Mock 모드 (USE_MOCK)

API 키 보안과 프로덕션 품질을 이유로 백엔드가 모든 외부 API를 중개한다. 프론트엔드는 항상 자체 백엔드만 호출한다.

번역은 `USE_MOCK` 값과 무관하게 항상 Upstage solar-pro2를 사용한다.
에이전트는 `USE_MOCK` 값에 따라 달라진다.

| | Mock | 프로덕션 |
|---|---|---|
| 번역 | Upstage solar-pro2 | Upstage solar-pro2 |
| 에이전트 | Upstage solar-pro2 (단일 호출) | Upstage solar-pro2 + Tavily 웹 검색 |
| API 키 | `UPSTAGE_API_KEY` | `UPSTAGE_API_KEY`, `TAVILY_API_KEY` |

### 프로덕션 에이전트 파이프라인 (`solar_agent.py`)

`USE_MOCK=false` 시 동작하는 4단계 파이프라인:

```
1. 주장 파악 (decision)
   최신 교환에서 검증할 사실적 주장을 짧은 구절로 요약
   (이전 맥락은 배경으로 참고, 최신 교환만 평가 대상)

2. 쿼리 계획 (_plan_queries)
   주장 검증에 필요한 단서 유형을 파악하고
   타겟 검색 쿼리 1-2개 생성

3. Tavily 검색
   쿼리별 병렬 검색, 중복 URL 제거 후 결과 합산

4. 추론·검증 (verify)
   검색 결과를 단서로 삼아 자체 지식 보완 후 결론 도출
   → Fallback: 검색 실패/불충분 시 자체 지식만으로 재시도
```

### 에이전트 히스토리 기반 컨텍스트 + KV 캐시

에이전트는 단일 발화가 아닌 **누적 대화 전체**를 컨텍스트로 받는다. 이를 통해 "10만원입니다"라는 응답이 앞선 "서울역에서 수서역까지 택시비"라는 질문의 맥락임을 파악한다.

멀티턴 메시지 구조로 KV 캐시를 활용한다.

```
[System]  ← 항상 동일 → KV 캐시 히트
[User]    1턴 발화     ← 변경 없음 → KV 캐시 히트
[Asst]    SKIP         ← 변경 없음 → KV 캐시 히트
[User]    2턴 발화     ← 변경 없음 → KV 캐시 히트
[Asst]    팩트체크 결과 ← 변경 없음 → KV 캐시 히트
[User]    최신 발화    ← 새로 추가
```

대화가 길어질수록 앞부분의 캐시 히트율이 높아져 비용과 응답 속도가 개선된다.

### 팩트체크 결과 언어 (response_lang)

결과 언어는 발화 화자(`source_lang`)가 아닌 **하단 패널 화자 언어**(`response_lang`)로 고정한다. 상대방이 어떤 언어로 말했든 팩트체크는 항상 기기를 정방향으로 보는 사람의 언어로 표시된다.

### 위치 컨텍스트

브라우저 Geolocation API로 좌표를 획득하고, Nominatim으로 역지오코딩해 `"강남구, 서울, 대한민국"` 형태의 문자열로 변환한다. 이를 에이전트 시스템 프롬프트에 주입해 출발지를 알 수 없는 택시 요금 질문 등에서 현지 맥락을 제공한다.

---

## 데이터 흐름 (발화 1회)

```
1. 사용자 입력 (텍스트 또는 마이크)
       │
2. sendMessage()
   ├── translate(text, sourceLang, targetLang)
   │       │
   │   POST /api/translate
   │       │ backend: upstage.translate (항상 Upstage solar-pro2)
   │       │
   │   translated text 반환
   │       │
   │   setMessages([...prev, { original, translation, agentResponse: null }])
   │       │
   │   UI: 번역 결과 표시
   │
   └── runAgentStream(agentHistory, { responseLang, debug, userLocation })
           │
       POST /api/agent/stream  { history[], response_lang, debug, user_location }
           │ USE_MOCK=true  → upstage.stream_agent (단일 LLM 호출)
           │ USE_MOCK=false → solar_agent.stream_agent_response (4단계 파이프라인)
           │
       SSE stream:
         event: status (analyzing)  → agentStatus = 'analyzing'
         event: status (searching)  → agentStatus = 'searching', 오버레이 표시
         event: reasoning           → agentReasoning 업데이트 (debug only)
         event: verify              → agentVerifyNote 업데이트 (debug only)
         event: result              → agentResult 업데이트
         event: done                → agentStatus = 'done'
           │
       onComplete(result)
           │
       setMessages: 해당 메시지의 agentResponse 기록 (KV 캐시용)
```

---

## 환경 설정

### 백엔드 (`backend/.env`)

```env
USE_MOCK=true              # true: Upstage 단독 / false: Upstage + Tavily 웹 검색

UPSTAGE_API_KEY=...        # 항상 필요 (번역 + 에이전트)
TAVILY_API_KEY=...         # USE_MOCK=false 시 웹 검색에 사용
                           # 미설정 시 자체 지식 fallback으로 동작
```

### 프론트엔드 (`frontend/.env`)

```env
VITE_API_URL=http://localhost:8000   # 백엔드 주소 (기본값 동일)
```
