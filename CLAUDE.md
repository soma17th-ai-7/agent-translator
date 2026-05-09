# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

**Frontend** (`frontend/` 디렉토리):
```bash
npm run dev       # Start Vite dev server with HMR
npm run build     # Type-check (tsc -b) then bundle to dist/
npm run lint      # ESLint
npm run preview   # Serve production build locally
```

**Backend** (`backend/` 디렉토리):
```bash
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env   # 후 API 키 입력
uvicorn app.main:app --reload  # http://localhost:8000
```

No test runner is configured.

## Architecture

This is a **frontend-only prototype** of a real-time conversational translation app with an AI agent fact-checking layer. The backend directory exists but is empty — all logic is currently mocked in the frontend.

**Stack:** React 19, TypeScript 6, Vite 8. No UI component library — styling uses CSS custom properties defined in `src/index.css`.

### Core Design: Step-Based State Machine

The entire conversation flow is driven by a single `step` integer (0–5) in `App.tsx`. Each step reveals the next piece of UI:

| Step | What appears |
|------|-------------|
| 0 | Initial idle state |
| 1 | Korean speaker's voice input |
| 2 | English translation of Korean input |
| 3 | English speaker's response |
| 4 | Korean back-translation |
| 5 | Agent fact-check notification |

State transitions are triggered by `setTimeout` chains — no real speech-to-text or translation API is wired up yet. `handleBottomMicClick()` drives the full demo sequence.

### Two-Pane Layout

The app simulates a single mobile device held between two people:
- **Bottom pane** (Korean speaker): normal orientation
- **Top pane** (English speaker): rotated 180° via CSS so it reads right-side-up from the other end

The phone frame is fixed at 414×896px (iPhone 12/13/14 size) defined in `index.css`.

### Agent Intervention UI

The `.subtle-agent-note` component (backdrop-filter blurred overlay) appears at step 5 to surface a hardcoded fare correction. This is the placeholder for real agent tool calls.

### External Assets (CDN)

Font Awesome 6.0.0 (icons) and Google Fonts Inter are loaded via CDN links in `index.html` — no npm packages for these.

## Backend 구조

```
backend/
├── app/
│   ├── main.py              # FastAPI 앱, CORS, 라우터 등록
│   ├── models.py            # Pydantic 요청/응답 모델
│   ├── routers/
│   │   ├── translate.py     # POST /api/translate
│   │   └── agent.py         # POST /api/agent/stream (SSE)
│   └── services/
│       ├── deepl.py         # DeepL API 호출
│       └── claude_agent.py  # Claude 에이전트 루프 + Tavily 웹 검색
```

에이전트는 `AsyncAnthropic` 클라이언트로 tool_choice=auto 설정 하에 agentic loop를 돌린다. 웹 검색이 필요하면 Tavily를 호출하고, 결과를 tool_result로 다시 Claude에게 전달한다.

## What's Mocked vs. Real

- Speech-to-text: 여전히 `setTimeout`으로 시뮬레이션 (STT 미구현)
- Translation: 백엔드 구현 완료 (DeepL)
- Agent fact-check: 백엔드 구현 완료 (Claude + Tavily)
- 프론트엔드↔백엔드 연동: 미구현 (프론트엔드가 아직 하드코딩 사용)
