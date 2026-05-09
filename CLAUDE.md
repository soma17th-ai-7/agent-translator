# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

All commands run from the `frontend/` directory:

```bash
npm run dev       # Start Vite dev server with HMR
npm run build     # Type-check (tsc -b) then bundle to dist/
npm run lint      # ESLint
npm run preview   # Serve production build locally
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

## What's Mocked vs. Real

- Speech-to-text: mocked with `setTimeout`
- Translation: hardcoded Korean/English strings in `App.tsx`
- Agent fact-check: hardcoded message, no API call
- Backend: `backend/` directory is empty
