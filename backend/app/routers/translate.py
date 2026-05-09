from fastapi import APIRouter, HTTPException
from app.models import TranslateRequest, TranslateResponse
from app.services import deepl
import httpx

router = APIRouter()


@router.post("/translate", response_model=TranslateResponse)
async def translate(body: TranslateRequest):
    if body.source_lang == body.target_lang:
        raise HTTPException(status_code=400, detail="source_lang and target_lang must differ")

    try:
        translated = await deepl.translate(body.text, body.source_lang, body.target_lang)
    except httpx.HTTPStatusError as e:
        raise HTTPException(status_code=502, detail=f"DeepL error: {e.response.status_code}")
    except Exception as e:
        raise HTTPException(status_code=502, detail=str(e))

    return TranslateResponse(translated_text=translated)
