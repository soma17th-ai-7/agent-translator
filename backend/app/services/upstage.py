import json
import os
import re
from typing import AsyncGenerator, Optional

import httpx

_UPSTAGE_URL = "https://api.upstage.ai/v1/chat/completions"
_MOCK_MODEL = "solar-pro2"
_LANG_NAME = {"KO": "Korean", "EN": "English"}


def _headers() -> dict:
    return {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {os.environ['UPSTAGE_API_KEY']}",
    }


def _strip_role_tokens(text: str) -> str:
    return re.sub(r"\s*(assistant|user|system)\s*$", "", text, flags=re.IGNORECASE).strip()


async def translate(text: str, source_lang: str, target_lang: str) -> str:
    async with httpx.AsyncClient() as client:
        response = await client.post(
            _UPSTAGE_URL,
            headers=_headers(),
            json={
                "model": _MOCK_MODEL,
                "max_tokens": 512,
                "messages": [
                    {
                        "role": "system",
                        "content": "You are a professional translator. Output only the translated text with no labels, role names, or explanations.",
                    },
                    {
                        "role": "user",
                        "content": f"Translate from {_LANG_NAME[source_lang]} to {_LANG_NAME[target_lang]}:\n{text}",
                    },
                ],
            },
            timeout=30.0,
        )
        response.raise_for_status()

    content = response.json()["choices"][0]["message"]["content"]
    return _strip_role_tokens(content)


def _build_agent_messages(
    history: list[dict],
    response_lang: str,
    debug: bool,
    user_location: Optional[str] = None,
) -> list[dict]:
    location_ctx = (
        f"\nUser's current location: {user_location}\n"
        f"Use this as background context when relevant (e.g., local fares, distances, regulations)."
        if user_location else ""
    )

    if debug:
        system_content = (
            f"You are a fact-checking assistant for a real-time translation app.\n"
            f"You have the full conversation history for context. Focus on the LATEST exchange, "
            f"using prior context to understand it.\n"
            f"Check for verifiable factual claims (prices, distances, regulations, business hours, etc.)."
            f"{location_ctx}\n\n"
            f"Respond in this EXACT format (no extra text):\n"
            f"REASONING: [팩트체크 여부를 결정한 근거를 1-2문장으로 한국어로 설명]\n"
            f"RESULT: [Either \"SKIP\" if nothing to fact-check, or a concise 1-2 sentence "
            f"fact-check note in {_LANG_NAME[response_lang]}, within 120 characters]"
        )
    else:
        system_content = (
            f"You are a fact-checking assistant for a real-time translation app.\n"
            f"You have the full conversation history for context. Focus on the LATEST exchange, "
            f"using prior context to understand it.\n"
            f"Check for verifiable factual claims (prices, distances, regulations, business hours, etc.)."
            f"{location_ctx}\n"
            f"- If the LATEST exchange contains a claim worth fact-checking: respond with a concise "
            f"note in {_LANG_NAME[response_lang]}, within 120 characters.\n"
            f"- Otherwise: respond with exactly \"SKIP\" and nothing else."
        )

    messages: list[dict] = [{"role": "system", "content": system_content}]

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


def _parse_debug_response(raw: str) -> tuple[str, str]:
    import re as _re
    reasoning_match = _re.search(r"REASONING:\s*([\s\S]*?)(?=\nRESULT:)", raw, _re.IGNORECASE)
    result_match = _re.search(r"RESULT:\s*([\s\S]*)$", raw, _re.IGNORECASE)
    reasoning = _strip_role_tokens(reasoning_match.group(1).strip() if reasoning_match else "")
    result = _strip_role_tokens(result_match.group(1).strip() if result_match else raw)
    return reasoning, result


async def stream_agent(
    history: list[dict],
    response_lang: str,
    debug: bool = False,
    user_location: Optional[str] = None,
) -> AsyncGenerator[str, None]:
    yield f"event: status\ndata: {json.dumps({'state': 'analyzing'})}\n\n"

    try:
        async with httpx.AsyncClient() as client:
            response = await client.post(
                _UPSTAGE_URL,
                headers=_headers(),
                json={
                    "model": _MOCK_MODEL,
                    "max_tokens": 512 if debug else 256,
                    "messages": _build_agent_messages(history, response_lang, debug, user_location),
                },
                timeout=30.0,
            )
            response.raise_for_status()

        raw = _strip_role_tokens(response.json()["choices"][0]["message"]["content"])

        if debug:
            reasoning, result = _parse_debug_response(raw)
            if reasoning:
                yield f"event: reasoning\ndata: {json.dumps({'text': reasoning}, ensure_ascii=False)}\n\n"
            if not result or result.strip().upper().startswith("SKIP"):
                yield f"event: done\ndata: {{}}\n\n"
                return
            yield f"event: status\ndata: {json.dumps({'state': 'searching', 'query': 'fact-checking'})}\n\n"
            yield f"event: result\ndata: {json.dumps({'text': result}, ensure_ascii=False)}\n\n"
        else:
            if not raw or raw.strip().upper().startswith("SKIP"):
                yield f"event: done\ndata: {{}}\n\n"
                return
            yield f"event: status\ndata: {json.dumps({'state': 'searching', 'query': 'fact-checking'})}\n\n"
            yield f"event: result\ndata: {json.dumps({'text': raw}, ensure_ascii=False)}\n\n"

    except Exception as e:
        yield f"event: error\ndata: {json.dumps({'message': str(e)})}\n\n"

    yield f"event: done\ndata: {{}}\n\n"
