from pydantic import BaseModel
from typing import Literal, Optional, List

Lang = Literal["KO", "EN"]


class TranslateRequest(BaseModel):
    text: str
    source_lang: Lang
    target_lang: Lang


class TranslateResponse(BaseModel):
    translated_text: str


class AgentHistoryEntry(BaseModel):
    source_lang: Lang
    source_text: str
    target_lang: Lang
    translated_text: str
    agent_response: Optional[str] = None


class AgentStreamRequest(BaseModel):
    history: List[AgentHistoryEntry]
    response_lang: Lang
    debug: bool = False
    user_location: Optional[str] = None
