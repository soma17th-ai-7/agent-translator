# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

**Frontend** (`frontend/` 디렉토리):
```bash
npm install               # 의존성 설치
npm run dev               # Vite 개발 서버 (http://localhost:5173)
npm run build             # 타입 체크 후 프로덕션 빌드
npm run lint              # ESLint
```

**Backend** (`backend/` 디렉토리):
```bash
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env      # API 키 입력 후
uvicorn app.main:app --reload   # http://localhost:8000
```

`.env` 변경 시 서버를 재시작해야 반영된다 (`--reload`는 `.env`를 감지하지 않음).

No test runner is configured.

## Architecture

두 사람이 하나의 기기를 사이에 두고 대화하는 실시간 번역 앱. 프론트엔드(React)는 항상 백엔드(FastAPI)를 통해서만 외부 API를 호출한다.

**Stack:** React 19 + TypeScript 6 + Vite 8 (frontend) / Python + FastAPI (backend)

### Frontend 핵심 구조

상태 관리의 핵심은 `Message[]` 배열 히스토리와 에이전트 상태다 (`App.tsx`).

```typescript
interface Message {
  id: number
  speaker: 'bottom' | 'top'
  original: string
  translation: string
  agentResponse: string | null  // 에이전트 응답 기록 (KV 캐시용)
}
```

**입력 흐름**: 사용자 발화 → `sendMessage()` → `translate()` + `runAgentStream()` 동시 호출 → 번역 결과 즉시 표시, 팩트체크 비동기 도착.

step 기반 상태 머신은 제거됐다. 두 화자 모두 순서 제약 없이 자유롭게 발화한다.

**언어 설정**: `bottomLang` state 하나로 관리. `topLang`은 항상 반대 언어로 파생.

**에이전트 KV 캐시**: `Message.agentResponse`에 이전 에이전트 응답을 기록해두고, 다음 호출 시 멀티턴 메시지 구조의 `assistant` 턴으로 재사용. 이전 턴이 변경되지 않으므로 KV 캐시가 동작한다.

### Backend 구조

```
backend/app/
├── main.py              # FastAPI 앱, CORS (localhost:5173 허용)
├── models.py            # Pydantic 모델 (AgentHistoryEntry, AgentStreamRequest 등)
├── routers/
│   ├── translate.py     # POST /api/translate — USE_MOCK 분기
│   └── agent.py         # POST /api/agent/stream (SSE) — USE_MOCK 분기
└── services/
    ├── upstage.py       # Mock: Upstage solar-pro2 번역 + 팩트체크
    ├── deepl.py         # 프로덕션: DeepL 번역
    └── claude_agent.py  # 프로덕션: Claude API + Tavily 웹 검색
```

`USE_MOCK` env var가 `true`면 `upstage.py`로, `false`면 `deepl.py` + `claude_agent.py`로 라우팅된다. 값은 서버 시작 시 모듈 임포트 시점에 읽힌다.

### Two-Pane Layout

- **하단 패널**: 정방향 화자 (기본값: 한국어)
- **상단 패널**: 180도 회전, 반대편 화자 (기본값: 영어)
- 폰 프레임: 414×896px 고정 (`index.css`)
- 언어 교환 버튼, 위치 뱃지, 디버그 토글이 두 패널 사이 `.pane-divider`에 배치

### 팩트체크 결과 언어

`response_lang`은 항상 `bottomLang`으로 고정. 어느 화자가 발화했든 팩트체크는 하단 화자의 언어로 표시된다.

### External Assets (CDN)

Font Awesome 6.0.0(아이콘)과 Google Fonts Inter는 `index.html` CDN 링크로 로드 — npm 패키지 없음.

## Mock vs. 프로덕션

| 항목 | Mock (`USE_MOCK=true`) | 프로덕션 (`USE_MOCK=false`) |
|------|------------------------|------------------------------|
| 번역 | Upstage solar-pro2 | DeepL |
| 에이전트 | Upstage solar-pro2 | Claude API + Tavily |
| STT | setTimeout 시뮬레이션 | 미구현 |

## 설계 문서

- `docs/architecture.md` — 기술 스택, 전체 아키텍처, 데이터 흐름
- `docs/api-spec.md` — API 엔드포인트 명세
- `docs/functional-spec.md` — 기능 명세
- `docs/dev-setup.md` — 개발 환경 설정 상세 가이드
