import os
import httpx

# 유료 플랜 사용 시 api.deepl.com 으로 변경
_DEEPL_URL = "https://api-free.deepl.com/v2/translate"


async def translate(text: str, source_lang: str, target_lang: str) -> str:
    api_key = os.environ["DEEPL_API_KEY"]

    async with httpx.AsyncClient() as client:
        response = await client.post(
            _DEEPL_URL,
            headers={"Authorization": f"DeepL-Auth-Key {api_key}"},
            json={
                "text": [text],
                "source_lang": source_lang,
                "target_lang": target_lang,
            },
            timeout=10.0,
        )
        response.raise_for_status()

    return response.json()["translations"][0]["text"]
