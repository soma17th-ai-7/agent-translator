# API 명세

Base URL: `http://localhost:8000`

---

## 1. 번역

### `POST /api/translate`

텍스트를 번역한다. Upstage solar-pro2를 사용하며 `USE_MOCK` 설정과 무관하게 동작한다.

**Request**

```json
{
  "text": "공항까지 가는데 택시비가 얼마예요?",
  "source_lang": "KO",
  "target_lang": "EN"
}
```

| 필드 | 타입 | 설명 |
|------|------|------|
| `text` | string | 번역할 원문 텍스트 |
| `source_lang` | `"KO"` \| `"EN"` | 원문 언어 |
| `target_lang` | `"KO"` \| `"EN"` | 번역 대상 언어 |

**Response `200 OK`**

```json
{
  "translated_text": "How much is the taxi fare to the airport?"
}
```

**Response `400 Bad Request`**

```json
{ "detail": "source_lang and target_lang must differ" }
```

**Response `502 Bad Gateway`**

```json
{ "detail": "Translation API error: 403" }
```

---

## 2. 에이전트 팩트체크 (SSE)

### `POST /api/agent/stream`

누적 대화 히스토리를 분석해 팩트체크 정보를 SSE로 스트리밍한다.
백엔드의 `USE_MOCK` 설정에 따라 에이전트 엔진이 결정된다.

- `USE_MOCK=true`: Upstage solar-pro2 단일 호출 (웹 검색 없음)
- `USE_MOCK=false`: 4단계 파이프라인 — 주장 파악 → 쿼리 계획 → Tavily 웹 검색 → 추론·검증

**Request**

```json
{
  "history": [
    {
      "source_lang": "KO",
      "source_text": "서울역에서 수서역까지 택시비가 얼마예요?",
      "target_lang": "EN",
      "translated_text": "How much is the taxi fare from Seoul Station to Suseo Station?",
      "agent_response": "SKIP"
    },
    {
      "source_lang": "EN",
      "source_text": "It's about 100,000 won.",
      "target_lang": "KO",
      "translated_text": "약 10만원입니다.",
      "agent_response": null
    }
  ],
  "response_lang": "KO",
  "debug": false,
  "user_location": "강남구, 서울, 대한민국"
}
```

| 필드 | 타입 | 설명 |
|------|------|------|
| `history` | array | 누적 대화 목록 (오래된 순) |
| `history[].source_lang` | `"KO"` \| `"EN"` | 화자의 언어 |
| `history[].source_text` | string | 화자의 원문 |
| `history[].target_lang` | `"KO"` \| `"EN"` | 번역 대상 언어 |
| `history[].translated_text` | string | 번역된 텍스트 |
| `history[].agent_response` | string \| null | 이전 에이전트 응답 (KV 캐시용). `null`이면 미처리 |
| `response_lang` | `"KO"` \| `"EN"` | 팩트체크 결과를 반환할 언어 (항상 하단 패널 화자 언어) |
| `debug` | boolean | 디버그 모드 여부 (기본값 `false`) |
| `user_location` | string \| null | 사용자 현재 위치 (Nominatim 역지오코딩 결과) |

**Response `200 OK`**

`Content-Type: text/event-stream`

```
event: status
data: {"state": "analyzing"}

event: status
data: {"state": "searching", "query": "서울역 수서역 택시 요금"}

event: result
data: {"text": "서울역-수서역 택시 요금은 통상 1만~1.5만원 수준입니다."}

event: done
data: {}
```

**팩트체크 불필요 시** (인사말, 의견 등)

```
event: status
data: {"state": "analyzing"}

event: done
data: {}
```

**디버그 모드 (`debug: true`) 시** — `reasoning`, `verify` 이벤트 추가

```
event: status
data: {"state": "analyzing"}

event: status
data: {"state": "searching", "query": "서울역 수서역 택시 요금 / 서울역 수서역 거리"}

event: reasoning
data: {"text": "결과 5개 수집"}

event: verify
data: {"text": "팩트체크 완료 (검색 기반)"}

event: result
data: {"text": "서울역-수서역 택시 요금은 통상 1만~1.5만원 수준입니다."}

event: done
data: {}
```

**SSE 이벤트 타입**

| 이벤트 | data 형태 | 설명 |
|--------|-----------|------|
| `status` | `{"state": "analyzing"}` | 에이전트 분석 시작 |
| `status` | `{"state": "searching", "query": string}` | 팩트체크 검색 수행 중 (`query`는 실제 검색어) |
| `result` | `{"text": string}` | 팩트체크 결과 |
| `reasoning` | `{"text": string}` | 검색 결과 수집 현황 (디버그 모드 전용) |
| `verify` | `{"text": string}` | 검증 단계 진행 상황 (디버그 모드 전용) |
| `done` | `{}` | 스트림 종료 |
| `error` | `{"message": string}` | 에러 발생 후 스트림 종료 |

**Result 텍스트 언어**: `response_lang` 기준으로 반환한다. 항상 하단 패널 화자의 언어이므로, 어느 화자가 마지막으로 발화했든 관계없이 동일한 언어로 표시된다.
