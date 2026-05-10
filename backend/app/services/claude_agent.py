import json
import os
from typing import AsyncGenerator, Optional

import anthropic
import httpx

_LANG_NAME = {"KO": "Korean", "EN": "English"}

_TOOLS = [
    {
        "name": "web_search",
        "description": "Search the web for current and accurate information.",
        "input_schema": {
            "type": "object",
            "properties": {
                "query": {
                    "type": "string",
                    "description": "The search query string.",
                }
            },
            "required": ["query"],
        },
    }
]


def _sse(event: str, data: dict) -> str:
    return f"event: {event}\ndata: {json.dumps(data, ensure_ascii=False)}\n\n"


async def _web_search(query: str) -> str:
    api_key = os.environ.get("TAVILY_API_KEY")
    if not api_key:
        return "Web search unavailable: TAVILY_API_KEY not set."

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
            results = resp.json().get("results", [])
            return "\n\n".join(
                f"{r['title']}\n{r['url']}\n{r['content']}" for r in results
            ) or "No results found."
        except Exception as e:
            return f"Search error: {e}"


async def stream_agent_response(
    history: list[dict],
    response_lang: str,
    debug: bool = False,
    user_location: Optional[str] = None,
) -> AsyncGenerator[str, None]:
    client = anthropic.AsyncAnthropic()
    lang_name = _LANG_NAME.get(response_lang, response_lang)

    location_ctx = (
        f"\nUser's current location: {user_location}\n"
        f"Use this as background context when relevant (e.g., local fares, distances, regulations)."
        if user_location else ""
    )

    system_prompt = (
        f"You are a fact-checking assistant for a real-time translation app.\n"
        f"You have the full conversation history for context. Focus on the LATEST exchange, "
        f"using prior context to understand it.\n"
        f"Analyze the conversation and decide whether any factual claims need verification "
        f"(prices, distances, business hours, local regulations, etc.)."
        f"{location_ctx}\n\n"
        f"- If fact-checking is needed: use web_search, then write a concise note (2-3 sentences). "
        f"If you reference a source, include its URL in parentheses, e.g. (https://example.com).\n"
        f"- If no fact-checking is needed (greetings, opinions, simple questions): "
        f"respond with an empty string.\n\n"
        f"Always respond in {lang_name}."
    )

    messages: list = []
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
                "content": entry["agent_response"] or "",
            })

    yield _sse("status", {"state": "analyzing"})

    try:
        while True:
            response = await client.messages.create(
                model="claude-sonnet-4-6",
                max_tokens=512,
                system=system_prompt,
                tools=_TOOLS,
                tool_choice={"type": "auto"},
                messages=messages,
            )

            tool_use_blocks = [b for b in response.content if b.type == "tool_use"]
            text_blocks = [b for b in response.content if b.type == "text"]

            if tool_use_blocks:
                messages.append({"role": "assistant", "content": response.content})
                tool_results = []

                for block in tool_use_blocks:
                    if block.name == "web_search":
                        query = block.input["query"]
                        yield _sse("status", {"state": "searching", "query": query})
                        result = await _web_search(query)
                        tool_results.append({
                            "type": "tool_result",
                            "tool_use_id": block.id,
                            "content": result,
                        })

                messages.append({"role": "user", "content": tool_results})

            else:
                final_text = "".join(b.text for b in text_blocks).strip()
                if final_text:
                    yield _sse("result", {"text": final_text})
                break

    except Exception as e:
        yield _sse("error", {"message": str(e)})

    yield _sse("done", {})
