import os
from fastapi import APIRouter
from fastapi.responses import StreamingResponse
from app.models import AgentStreamRequest
from app.services.claude_agent import stream_agent_response
from app.services import upstage

router = APIRouter()

_USE_MOCK = os.environ.get("USE_MOCK", "false").lower() == "true"


@router.post("/agent/stream")
async def agent_stream(body: AgentStreamRequest):
    if _USE_MOCK:
        stream = upstage.stream_agent(
            history=[entry.model_dump() for entry in body.history],
            response_lang=body.response_lang,
            debug=body.debug,
            user_location=body.user_location,
        )
    else:
        # 실제 Claude 에이전트: 최신 턴만 전달 (추후 히스토리 지원 확장 가능)
        latest = body.history[-1]
        stream = stream_agent_response(
            source_lang=latest.source_lang,
            source_text=latest.source_text,
            target_lang=latest.target_lang,
            translated_text=latest.translated_text,
        )

    return StreamingResponse(
        stream,
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )
