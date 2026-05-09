from fastapi import APIRouter
from fastapi.responses import StreamingResponse
from app.models import AgentStreamRequest
from app.services.claude_agent import stream_agent_response

router = APIRouter()


@router.post("/agent/stream")
async def agent_stream(body: AgentStreamRequest):
    return StreamingResponse(
        stream_agent_response(
            source_lang=body.source_lang,
            source_text=body.source_text,
            target_lang=body.target_lang,
            translated_text=body.translated_text,
        ),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )
