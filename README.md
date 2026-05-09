# 에이전트 기반 실시간 번역 앱

두 사람이 하나의 기기를 사이에 두고 각자의 언어로 대화하면 실시간으로 번역해주는 앱. AI 에이전트가 대화를 분석해 팩트체크가 필요한 내용을 감지하면 비동기로 알림을 표시한다.

---

## 요구 사항

- Node.js 18+
- Python 3.9+

---

## 빠른 시작

> 가상환경 설정, 서버 실행 명령어, 자주 발생하는 문제 등 상세한 내용은 **[개발 환경 설정 가이드](docs/dev-setup.md)** 를 참고한다.

### 1. 백엔드 설정

```bash
cd backend

# 가상환경 생성 및 활성화
python -m venv .venv
source .venv/bin/activate        # Windows: .venv\Scripts\activate

# 의존성 설치
pip install -r requirements.txt

# 환경변수 파일 생성
cp .env.example .env
```

`.env` 파일을 열고 API 키를 입력한다.

```bash
# 서버 실행
uvicorn app.main:app --reload
# → http://localhost:8000
```

### 2. 프론트엔드 설정

```bash
cd frontend

# 의존성 설치
npm install

# 환경변수 파일 생성 (필요 시)
cp .env.example .env

# 개발 서버 실행
npm run dev
# → http://localhost:5173
```

---

## 환경변수

### 백엔드 (`backend/.env`)

모든 API 설정은 백엔드 `.env` 한 곳에서 관리한다.

```env
# ── 모드 선택 ────────────────────────────────────────────
# true  → Upstage API로 번역 + 팩트체크 (개발/데모, API 키 1개)
# false → DeepL(번역) + Claude + Tavily(팩트체크) (프로덕션)
USE_MOCK=true

# ── Mock 모드 (USE_MOCK=true) ─────────────────────────────
UPSTAGE_API_KEY=your_upstage_api_key_here

# ── 프로덕션 모드 (USE_MOCK=false) ───────────────────────
DEEPL_API_KEY=your_deepl_api_key_here
ANTHROPIC_API_KEY=your_anthropic_api_key_here
TAVILY_API_KEY=your_tavily_api_key_here
```

### 프론트엔드 (`frontend/.env`)

백엔드 주소가 기본값(`http://localhost:8000`)과 다를 때만 설정한다.

```env
VITE_API_URL=http://localhost:8000
```

---

## Mock 모드

개발·데모 환경에서 백엔드 `.env`의 `USE_MOCK=true`로 설정하면 **Upstage API 키 하나만으로 전체 기능이 동작**한다.

| | Mock 모드 | 프로덕션 모드 |
|---|---|---|
| 번역 | Upstage solar-pro2 | DeepL |
| 팩트체크 | Upstage solar-pro2 | Claude API + Tavily 웹 검색 |
| 필요한 API 키 | `UPSTAGE_API_KEY` | `DEEPL_API_KEY` + `ANTHROPIC_API_KEY` + `TAVILY_API_KEY` |

### API 키 발급

| 서비스 | 발급 주소 | 무료 티어 |
|--------|-----------|-----------|
| Upstage | https://console.upstage.ai | 있음 |
| DeepL | https://www.deepl.com/pro-api | 있음 (500,000자/월) |
| Anthropic | https://console.anthropic.com | 없음 (사용량 과금) |
| Tavily | https://tavily.com | 있음 |

### 모드 전환 방법

`backend/.env`의 `USE_MOCK` 값을 바꾼 후 **백엔드 서버를 재시작**한다.

```bash
# Mock 모드 → 프로덕션 모드
USE_MOCK=false

# 서버 재시작 (Ctrl+C 후)
uvicorn app.main:app --reload
```

> `.env` 변경은 서버를 재시작해야 반영된다. `--reload` 옵션은 Python 파일 변경만 감지한다.

---

## 주요 기능

- **양방향 번역**: 한국어 ↔ 영어 실시간 번역
- **자유 대화**: 순서 제약 없이 양쪽에서 자유롭게 발화
- **음성 / 텍스트 입력**: 패널별 독립 전환
- **언어 교환**: 두 패널 사이 버튼으로 즉시 교환
- **AI 팩트체크**: 누적 대화 맥락 기반으로 수치·요금 등 검증, 하단 오버레이 표시
- **위치 컨텍스트**: 브라우저 위치 정보를 에이전트에 전달해 현지 기준 팩트체크
- **디버그 모드**: 🐛 버튼으로 에이전트 추론 과정을 우측 사이드바에 표시

---

## 프로젝트 구조

```
├── frontend/          # React 19 + TypeScript + Vite
│   └── src/
│       ├── App.tsx    # 메인 컴포넌트
│       ├── services/
│       │   └── api.ts # 백엔드 HTTP 클라이언트
│       └── index.css
│
├── backend/           # Python + FastAPI
│   └── app/
│       ├── routers/   # translate, agent 엔드포인트
│       └── services/  # upstage, deepl, claude_agent
│
└── docs/              # 설계 문서
    ├── architecture.md    # 기술 스택 및 아키텍처
    ├── api-spec.md        # API 엔드포인트 명세
    ├── functional-spec.md # 기능 명세
    └── dev-setup.md       # 개발 환경 설정 상세 가이드
```

---

## 개발 명령어

### 프론트엔드

```bash
npm run dev      # 개발 서버 (HMR)
npm run build    # 프로덕션 빌드
npm run lint     # ESLint
```

### 백엔드

```bash
uvicorn app.main:app --reload   # 개발 서버
```
