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


async def _web_search(query: str) -> list[dict]:
    api_key = os.environ.get("TAVILY_API_KEY")
    if not api_key:
        return []

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
            return resp.json().get("results", [])
        except Exception:
            return []


async def stream_agent_response(
    history: list[dict],
    response_lang: str,
    debug: bool = False,
    user_location: Optional[str] = None,
) -> AsyncGenerator[str, None]:
    lang_name = _LANG_NAME.get(response_lang, response_lang)
    location_ctx = f"\nUser's current location: {user_location}" if user_location else ""

    history_text = "\n".join(
        f"[{_LANG_NAME[e['source_lang']]}] {e['source_text']} → [{_LANG_NAME[e['target_lang']]}] {e['translated_text']}"
        for e in history
    )
    latest = history[-1]
    latest_text = (
        f"[{_LANG_NAME[latest['source_lang']]}] {latest['source_text']}\n"
        f"[{_LANG_NAME[latest['target_lang']]}] {latest['translated_text']}"
    )

    yield _sse("status", {"state": "analyzing"})

    try:
        # Step 1: Solar가 검색 필요 여부 + 쿼리 결정
        decision_messages = [
            {
                "role": "system",
                "content": (
                    "You are a fact-checking assistant for a real-time translation app."
                    f"{location_ctx}\n"
                    "Given a conversation, decide if the LATEST exchange contains a verifiable factual claim "
                    "(prices, distances, business hours, regulations, etc.).\n"
                    "- If yes: respond with only a specific web search query. "
                    "Include exact names (stations, places, services) and the type of information needed (fare, route, hours, etc.). "
                    "Do not add any explanation.\n"
                    "- If no: respond with exactly \"SKIP\"."
                ),
            },
            {
                "role": "user",
                "content": f"Conversation history:\n{history_text}\n\nFocus on the latest exchange:\n{latest_text}",
            },
        ]

        decision = await _solar(decision_messages, max_tokens=64)

        if decision.strip().upper() == "SKIP" or not decision.strip():
            yield _sse("done", {})
            return

        # Step 2: Tavily 실검색
        query = decision.strip()
        yield _sse("status", {"state": "searching", "query": query})
        results = await _web_search(query)

        if not results:
            yield _sse("done", {})
            return

        search_context = "\n\n".join(
            f"{r['title']}\n{r['url']}\n{r['content']}" for r in results
        )

        # Step 3: Solar가 검색 결과 바탕으로 검증 작성
        verify_messages = [
            {
                "role": "system",
                "content": (
                    f"You are a fact-checking assistant. "
                    f"Your ONLY job is to report what the web search results say. "
                    f"STRICT RULES:\n"
                    f"- Use ONLY information explicitly stated in the search results below. "
                    f"Do NOT add, infer, or assume anything from your own knowledge.\n"
                    f"- If the search results contradict the conversation, clearly state the correct information.\n"
                    f"- If the search results do not contain enough information to verify the claim, "
                    f"respond with exactly \"SKIP\".\n"
                    f"- Write one concise sentence in {lang_name}. "
                    f"Include the most relevant source URL in parentheses at the end, e.g. (https://example.com).\n"
                    f"- Output only the sentence. No extra text."
                ),
            },
            {
                "role": "user",
                "content": (
                    f"Conversation to fact-check:\n{latest_text}\n\n"
                    f"Web search results:\n{search_context}"
                ),
            },
        ]

        note = await _solar(verify_messages, max_tokens=200)

        if note and not note.strip().upper().startswith("SKIP"):
            yield _sse("result", {"text": note})

    except Exception as e:
        yield _sse("error", {"message": str(e)})

    yield _sse("done", {})
