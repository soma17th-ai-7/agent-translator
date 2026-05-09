# 개발 환경 설정 가이드

## 사전 요구 사항

| 도구 | 최소 버전 | 확인 명령어 |
|------|-----------|-------------|
| Node.js | 18+ | `node --version` |
| npm | 9+ | `npm --version` |
| Python | 3.9+ | `python3 --version` |

---

## 백엔드

### 1. 가상환경(venv) 생성

프로젝트 의존성이 시스템 Python과 분리되도록 가상환경을 만든다. **최초 1회만** 실행한다.

```bash
cd backend
python3 -m venv .venv
```

`backend/.venv/` 디렉토리가 생성된다.

---

### 2. 가상환경 활성화

터미널을 새로 열 때마다 실행해야 한다.

```bash
# macOS / Linux
source .venv/bin/activate

# Windows (PowerShell)
.venv\Scripts\Activate.ps1

# Windows (cmd)
.venv\Scripts\activate.bat
```

활성화되면 프롬프트 앞에 `(.venv)` 가 표시된다.

```
(.venv) user@machine backend %
```

가상환경을 **비활성화**하려면:

```bash
deactivate
```

---

### 3. 의존성 설치

가상환경이 활성화된 상태에서 **최초 1회** 실행한다.

```bash
pip install -r requirements.txt
```

`requirements.txt`가 변경됐을 때도 다시 실행한다.

---

### 4. 환경변수 파일 설정

```bash
cp .env.example .env
```

`.env` 파일을 열고 사용할 모드에 맞게 API 키를 입력한다.

```env
# 개발 환경: Mock 모드 권장 (API 키 1개로 전체 동작)
USE_MOCK=true
UPSTAGE_API_KEY=up-xxxxxxxxxxxxxxxxxxxxxxxx
```

> **주의**: `.env` 파일은 Git에 커밋하지 않는다 (`.gitignore`에 포함됨).

---

### 5. 개발 서버 실행

```bash
uvicorn app.main:app --reload
```

| 항목 | 값 |
|------|-----|
| 주소 | http://localhost:8000 |
| API 문서 (Swagger) | http://localhost:8000/docs |
| `--reload` | Python 파일 변경 시 자동 재시작 |

> **`.env` 변경 시에는 서버를 수동으로 재시작**해야 한다 (`Ctrl+C` 후 재실행).  
> `--reload`는 `.env` 변경을 감지하지 않는다.

---

## 프론트엔드

### 1. 의존성 설치

```bash
cd frontend
npm install
```

`package.json`이 변경됐을 때도 다시 실행한다.

---

### 2. 환경변수 파일 설정

백엔드 주소가 기본값(`http://localhost:8000`)과 동일하다면 이 단계는 건너뛰어도 된다.

```bash
cp .env.example .env
```

```env
VITE_API_URL=http://localhost:8000
```

---

### 3. 개발 서버 실행

```bash
npm run dev
```

| 항목 | 값 |
|------|-----|
| 주소 | http://localhost:5173 |
| HMR | 소스 파일 저장 시 브라우저 자동 갱신 |

---

## 두 서버 동시 실행

백엔드와 프론트엔드를 각각 별도의 터미널에서 실행한다.

**터미널 1 — 백엔드**
```bash
cd backend
source .venv/bin/activate
uvicorn app.main:app --reload
```

**터미널 2 — 프론트엔드**
```bash
cd frontend
npm run dev
```

브라우저에서 http://localhost:5173 접속.

---

## 터미널 재시작 시 체크리스트

새 터미널 세션을 열면 아래 순서로 실행한다.

```bash
# 백엔드
cd backend
source .venv/bin/activate      # 가상환경 재활성화 필수
uvicorn app.main:app --reload

# 프론트엔드 (다른 터미널)
cd frontend
npm run dev
```

> `npm run dev`는 가상환경이 필요 없다.  
> Python 관련 명령어(`uvicorn`, `pip` 등)는 반드시 가상환경 활성화 후 실행해야 한다.

---

## 자주 발생하는 문제

### `uvicorn: command not found`
가상환경이 활성화되지 않은 상태다.
```bash
source .venv/bin/activate
```

### `.env` 변경 후 동작이 바뀌지 않음
백엔드 서버를 재시작해야 한다.
```bash
# Ctrl+C로 종료 후
uvicorn app.main:app --reload
```

### `pip install` 후에도 패키지를 찾을 수 없음
가상환경 밖의 Python에 설치됐을 수 있다. 활성화 여부를 확인한다.
```bash
which python3    # .venv/bin/python3 이어야 함
which uvicorn    # .venv/bin/uvicorn 이어야 함
```

### CORS 오류
백엔드 `app/main.py`의 `allow_origins`에 프론트엔드 주소(`http://localhost:5173`)가 포함돼 있는지 확인한다.
