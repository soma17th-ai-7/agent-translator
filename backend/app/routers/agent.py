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
        stream = stream_agent_response(
            history=[entry.model_dump() for entry in body.history],
            response_lang=body.response_lang,
            debug=body.debug,
            user_location=body.user_location,
        )

    return StreamingResponse(
        stream,
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )
