from pydantic import BaseModel
from typing import Literal

Lang = Literal["KO", "EN"]


class TranslateRequest(BaseModel):
    text: str
    source_lang: Lang
    target_lang: Lang


class TranslateResponse(BaseModel):
    translated_text: str


class AgentStreamRequest(BaseModel):
    source_lang: Lang
    source_text: str
    target_lang: Lang
    translated_text: str
