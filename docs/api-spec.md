# API 명세

Base URL: `http://localhost:8000`

---

## 1. 번역

### `POST /api/translate`

DeepL을 통해 텍스트를 번역한다.

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
{
  "error": "invalid_request",
  "message": "source_lang and target_lang must differ"
}
```

**Response `502 Bad Gateway`**

```json
{
  "error": "deepl_error",
  "message": "DeepL API request failed"
}
```

---

## 2. 에이전트 팩트체크 (SSE)

### `POST /api/agent/stream`

번역된 대화를 분석해 팩트체크 정보를 SSE로 스트리밍한다.

**Request**

```json
{
  "source_lang": "KO",
  "source_text": "공항까지 가는데 택시비가 얼마예요?",
  "target_lang": "EN",
  "translated_text": "How much is the taxi fare to the airport?"
}
```

| 필드 | 타입 | 설명 |
|------|------|------|
| `source_lang` | `"KO"` \| `"EN"` | 화자의 언어 |
| `source_text` | string | 화자가 말한 원문 |
| `target_lang` | `"KO"` \| `"EN"` | 번역 대상 언어 |
| `translated_text` | string | 번역된 텍스트 |

**Response `200 OK`**

`Content-Type: text/event-stream`

SSE 이벤트 스트림으로 응답한다. 각 이벤트는 `event:` 와 `data:` 필드로 구성된다.

```
event: status
data: {"state": "analyzing"}

event: status
data: {"state": "searching", "query": "taxi fare airport New York 2024"}

event: result
data: {"text": "현지 시세 정보\n"}

event: result
data: {"text": "공항-시내 간 통상 요금은 $20~$25입니다."}

event: done
data: {}
```

**팩트체크 내용이 없는 경우** (인사말 등 팩트체크 불필요 시)

```
event: status
data: {"state": "analyzing"}

event: done
data: {}
```

**SSE 이벤트 타입**

| 이벤트 | data 형태 | 설명 |
|--------|-----------|------|
| `status` | `{"state": "analyzing"}` | 에이전트가 분석 시작 |
| `status` | `{"state": "searching", "query": string}` | 웹 검색 중 (검색어 포함) |
| `result` | `{"text": string}` | 팩트체크 결과 텍스트 (청크 단위로 반복) |
| `done` | `{}` | 스트림 종료 |
| `error` | `{"message": string}` | 에러 발생 후 스트림 종료 |

**Result 텍스트 언어**: 화자(`source_lang`)의 언어로 반환한다. 한국어 화자의 발화에 대한 팩트체크는 한국어로, 영어 화자의 발화에 대한 팩트체크는 영어로 반환한다.
