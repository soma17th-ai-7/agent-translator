import asyncio
import json
import os
from typing import AsyncGenerator, Optional

import httpx

_UPSTAGE_URL = "https://api.upstage.ai/v1/chat/completions"
_MODEL = "solar-pro2"
_LANG_NAME = {"KO": "Korean", "EN": "English"}


def _sse(event: str, data: dict) -> str:
    return f"event: {event}\ndata: {json.dumps(data, ensure_ascii=False)}\n\n"


def _headers() -> dict:
    return {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {os.environ['UPSTAGE_API_KEY']}",
    }


async def _solar(messages: list[dict], max_tokens: int = 256) -> str:
    async with httpx.AsyncClient() as client:
        resp = await client.post(
            _UPSTAGE_URL,
            headers=_headers(),
            json={"model": _MODEL, "max_tokens": max_tokens, "messages": messages},
            timeout=30.0,
        )
        resp.raise_for_status()
    return resp.json()["choices"][0]["message"]["content"].strip()


async def _web_search(query: str) -> tuple[list[dict], str]:
    """Returns (results, status) where status is 'ok' | 'no_key' | 'error:<msg>'"""
    api_key = os.environ.get("TAVILY_API_KEY")
    if not api_key:
        return [], "no_key"

    async with httpx.AsyncClient() as client:
        try:
            resp = await client.post(
                "https://api.tavily.com/search",
                json={
                    "api_key": api_key,
                    "query": query,
                    "max_results": 3,
                    "search_depth": "basic",
                },
                timeout=15.0,
            )
            resp.raise_for_status()
            return resp.json().get("results", []), "ok"
        except Exception as e:
            return [], f"error:{e}"


async def _plan_queries(
    claim: str,
    latest_text: str,
    location_ctx: str,
) -> list[str]:
    """주장 검증에 필요한 단서를 파악하고 타겟 검색 쿼리를 생성.
    최신 교환만 사용 — 이전 대화 맥락을 포함하면 이전 주제로 오염될 수 있음."""
    messages = [
        {
            "role": "system",
            "content": (
                "You are a search strategist for a fact-checking system."
                f"{location_ctx}\n\n"
                "Given a factual claim, reason about what clues are needed to verify it, "
                "then generate 1-2 targeted search queries to retrieve those clues.\n\n"
                "APPROACH:\n"
                "1. What specific pieces of information are needed to verify this claim?\n"
                "2. Design a query for each piece — each query should target ONE specific piece.\n\n"
                "QUERY RULES:\n"
                "- 1-2 queries, one per line\n"
                "- Concise and search-engine friendly (not a long descriptive sentence)\n"
                "- Include specific names (places, services, items) from the conversation\n"
                "- Use Korean or Korean/English mix as appropriate for the context\n"
                "- Output only the queries, nothing else"
            ),
        },
        {
            "role": "user",
            "content": f"Claim to verify: {claim}\n\nLatest exchange:\n{latest_text}",
        },
    ]
    result = await _solar(messages, max_tokens=128)
    queries = []
    for q in result.strip().splitlines():
        q = q.strip()
        if not q or q.upper() == "SKIP":
            continue
        words = q.split()
        if words[-1].upper() == "SKIP":
            q = " ".join(words[:-1]).strip()
        if q:
            queries.append(q)
    return queries


def _build_history_messages(history: list[dict]) -> list[dict]:
    """이전 agent_response를 assistant 턴으로 포함한 멀티턴 메시지 구성 (KV 캐시 활용).
    upstage.py의 _build_agent_messages()와 동일한 구조."""
    messages = []
    for i, entry in enumerate(history):
        is_last = i == len(history) - 1
        messages.append({
            "role": "user",
            "content": (
                f"[{_LANG_NAME[entry['source_lang']]}] {entry['source_text']}\n"
                f"[{_LANG_NAME[entry['target_lang']]}] {entry['translated_text']}"
            ),
        })
        if not is_last and entry.get("agent_response") is not None:
            messages.append({
                "role": "assistant",
                "content": entry["agent_response"] or "SKIP",
            })
    return messages


async def _fallback_fact_check(
    history: list[dict],
    lang_name: str,
    location_ctx: str,
) -> str:
    """검색 없이 Solar 자체 지식으로 팩트체크. 멀티턴 + agent_response KV 캐시 활용."""
    messages = [
        {
            "role": "system",
            "content": (
                f"You are a fact-checking assistant for a real-time translation app.\n"
                f"You have the full conversation history for context. Focus on the LATEST exchange, "
                f"using prior context to understand it.\n"
                f"Any price, fare, distance, or figure stated by EITHER speaker is a verifiable factual claim "
                f"— including answers given by locals or native speakers."
                f"{location_ctx}\n"
                f"- If the LATEST exchange states a price, fare, figure, or contradicts a previous fact-check: "
                f"reason from your knowledge and respond with a single concise sentence in {lang_name} "
                f"stating your conclusion (e.g. correct figure, typical range, or whether the claim seems accurate). "
                f"Output only the sentence, nothing else.\n"
                f"- Otherwise: respond with exactly \"SKIP\" and nothing else."
            ),
        },
        *_build_history_messages(history),
    ]
    return await _solar(messages, max_tokens=256)


async def stream_agent_response(
    history: list[dict],
    response_lang: str,
    debug: bool = False,
    user_location: Optional[str] = None,
) -> AsyncGenerator[str, None]:
    lang_name = _LANG_NAME.get(response_lang, response_lang)
    location_ctx = (
        f"\nUser's current location: {user_location}\n"
        f"Use this as background context when relevant (e.g., local fares, distances, regulations)."
        if user_location else ""
    )

    latest = history[-1]
    latest_text = (
        f"[{_LANG_NAME[latest['source_lang']]}] {latest['source_text']}\n"
        f"[{_LANG_NAME[latest['target_lang']]}] {latest['translated_text']}"
    )
    # verify에 전달할 전체 대화 맥락 (최신 발화만으로는 주제를 알 수 없는 경우 대비)
    conversation_context = "\n\n".join(
        f"[{_LANG_NAME[e['source_lang']]}] {e['source_text']}\n"
        f"[{_LANG_NAME[e['target_lang']]}] {e['translated_text']}"
        for e in history
    )

    yield _sse("status", {"state": "analyzing"})

    try:
        # Step 1: 주장 파악 — 최신 교환에 검증할 주장이 있는지 파악
        # 단일 user 메시지로 이전 맥락과 최신 교환을 명시적으로 분리:
        # multi-user-turn 구조는 어디가 최신인지 모호해서 이전 주제로 오염될 수 있음
        prior_turns_text = "\n\n".join(
            f"[{_LANG_NAME[e['source_lang']]}] {e['source_text']}\n"
            f"[{_LANG_NAME[e['target_lang']]}] {e['translated_text']}"
            for e in history[:-1]
        )
        decision_messages = [
            {
                "role": "system",
                "content": (
                    "You are a fact-checking assistant for a real-time translation app."
                    f"{location_ctx}\n"
                    "Determine if the LATEST EXCHANGE (clearly marked below) contains a verifiable "
                    "factual claim (prices, fares, distances, business hours, regulations, etc.). "
                    "Use prior conversation only as background context.\n"
                    "- If the LATEST EXCHANGE has a claim: describe it in a short specific phrase "
                    "(e.g. 'price of tteokbokki at Gwangjang Market', 'entry fee for Gyeongbokgung'). "
                    "Output only the phrase, nothing else.\n"
                    "- If no verifiable claim in the LATEST EXCHANGE: respond with exactly \"SKIP\"."
                ),
            },
            {
                "role": "user",
                "content": (
                    (f"Prior conversation:\n{prior_turns_text}\n\n" if prior_turns_text else "")
                    + f"LATEST EXCHANGE:\n{latest_text}"
                ),
            },
        ]

        decision = await _solar(decision_messages, max_tokens=32)

        if not decision.strip() or decision.strip().upper() == "SKIP":
            yield _sse("done", {})
            return

        claim = decision.strip()

        # Step 1b: 쿼리 계획 — 주장 검증에 필요한 단서와 타겟 쿼리 생성
        queries = await _plan_queries(claim, latest_text, location_ctx)
        if not queries:
            yield _sse("done", {})
            return

        # Step 2: Tavily 검색 (병렬)
        yield _sse("status", {"state": "searching", "query": " / ".join(queries)})
        raw_results = await asyncio.gather(*[_web_search(q) for q in queries])

        # 상태 집계: no_key > error > ok
        search_status = "ok"
        for _, status in raw_results:
            if status == "no_key":
                search_status = "no_key"
                break
            if status.startswith("error:"):
                search_status = status

        # 중복 URL 제거하며 결과 합산
        seen_urls: set[str] = set()
        combined_results: list[dict] = []
        for results, _ in raw_results:
            for r in results:
                if r["url"] not in seen_urls:
                    seen_urls.add(r["url"])
                    combined_results.append(r)

        # 검색 실패 또는 결과 없음 → 자체 지식 fallback
        if not combined_results:
            if debug:
                if search_status == "no_key":
                    yield _sse("reasoning", {"text": "TAVILY_API_KEY 미설정 — 검색 비활성화"})
                elif search_status.startswith("error:"):
                    yield _sse("reasoning", {"text": f"검색 오류: {search_status[6:]}"})
                else:
                    yield _sse("reasoning", {"text": "검색 수행됨, 결과 없음"})
                yield _sse("verify", {"text": "검색 실패 → 자체 지식으로 재시도"})

            fallback_note = await _fallback_fact_check(history, lang_name, location_ctx)
            fallback_skip = not fallback_note or fallback_note.strip().upper().startswith("SKIP")

            if debug:
                yield _sse("verify", {
                    "text": "자체 지식으로도 팩트체크 불가 → 생략" if fallback_skip else "팩트체크 완료 (자체 지식)"
                })
            if not fallback_skip:
                yield _sse("result", {"text": fallback_note})
            yield _sse("done", {})
            return

        if debug:
            yield _sse("reasoning", {"text": f"결과 {len(combined_results)}개 수집"})

        search_context = "\n\n".join(
            f"{r['title']}\n{r['url']}\n{r['content']}" for r in combined_results
        )

        # Step 3: 검색 결과를 단서로 주장을 추론·검증
        verify_messages = [
            {
                "role": "system",
                "content": (
                    f"You are a fact-checking assistant for a real-time translation app."
                    f"{location_ctx}\n\n"
                    f"Use the web search results as primary clues to reason about the factual claim. "
                    f"You may also draw on your own general knowledge (geography, distances, well-known facts) "
                    f"to fill in any gaps the search results leave, in order to complete the reasoning.\n\n"
                    f"PROCESS:\n"
                    f"1. Identify the specific claim or question from the conversation.\n"
                    f"2. Extract relevant clues from the search results "
                    f"(e.g. fare structures, rates, regulations).\n"
                    f"3. Combine those clues with any relevant general knowledge "
                    f"(e.g. approximate distance between locations, typical journey conditions) "
                    f"to calculate an estimate or reach a conclusion.\n\n"
                    f"OUTPUT RULES:\n"
                    f"- Write ONE concise sentence in {lang_name} stating your reasoned conclusion, "
                    f"followed by the most relevant source URL in parentheses.\n"
                    f"- Example: 광장시장 떡볶이 1인분은 약 5,000원입니다. (https://example.com)\n"
                    f"- If the search results are completely irrelevant AND you have no relevant knowledge: "
                    f"respond with exactly \"SKIP\".\n"
                    f"- Do NOT report raw data. State the reasoned conclusion.\n"
                    f"- Do NOT show reasoning steps or caveats. Output only the sentence and URL.\n"
                    f"- The URL must be a real https:// URL from the search results. "
                    f"NEVER write '(출처)' or any placeholder text.\n"
                    f"- Output exactly: one sentence followed by (URL). Or exactly \"SKIP\". Nothing else."
                ),
            },
            {
                "role": "user",
                "content": (
                    f"Conversation history (for context):\n{conversation_context}\n\n"
                    f"Focus on the latest exchange:\n{latest_text}\n\n"
                    f"Web search results:\n{search_context}"
                ),
            },
        ]

        note = await _solar(verify_messages, max_tokens=200)
        is_skip = not note or note.strip().upper().startswith("SKIP")

        if not is_skip:
            if debug:
                yield _sse("verify", {"text": "팩트체크 완료 (검색 기반)"})
            yield _sse("result", {"text": note})
        else:
            # 검색 결과 불충분 → 자체 지식 fallback
            if debug:
                yield _sse("verify", {"text": "검색 결과 불충분 → 자체 지식으로 재시도"})

            fallback_note = await _fallback_fact_check(history, lang_name, location_ctx)
            fallback_skip = not fallback_note or fallback_note.strip().upper().startswith("SKIP")

            if debug:
                yield _sse("verify", {
                    "text": "자체 지식으로도 팩트체크 불가 → 생략" if fallback_skip else "팩트체크 완료 (자체 지식)"
                })
            if not fallback_skip:
                yield _sse("result", {"text": fallback_note})

    except Exception as e:
        yield _sse("error", {"message": str(e)})

    yield _sse("done", {})
