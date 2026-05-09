import os
from fastapi import APIRouter, HTTPException
from app.models import TranslateRequest, TranslateResponse
from app.services import deepl
from app.services import upstage
import httpx

router = APIRouter()

_USE_MOCK = os.environ.get("USE_MOCK", "false").lower() == "true"


@router.post("/translate", response_model=TranslateResponse)
async def translate(body: TranslateRequest):
    if body.source_lang == body.target_lang:
        raise HTTPException(status_code=400, detail="source_lang and target_lang must differ")

    try:
        if _USE_MOCK:
            translated = await upstage.translate(body.text, body.source_lang, body.target_lang)
        else:
            translated = await deepl.translate(body.text, body.source_lang, body.target_lang)
    except httpx.HTTPStatusError as e:
        raise HTTPException(status_code=502, detail=f"Translation API error: {e.response.status_code}")
    except Exception as e:
        raise HTTPException(status_code=502, detail=str(e))

    return TranslateResponse(translated_text=translated)
