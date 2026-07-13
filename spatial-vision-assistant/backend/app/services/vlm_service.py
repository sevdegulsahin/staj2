"""
VLM Service — sends image + prompt to vLLM (Qwen2-VL / LLaVA) endpoint.
"""

import logging
from typing import Optional

import httpx

from app.config import settings

logger = logging.getLogger(__name__)

# OpenAI-compatible chat message format used by vLLM
_HEADERS = {"Content-Type": "application/json"}


async def query_vlm(image_base64: str, user_prompt: str) -> str:
    """
    Send base64-encoded image + text prompt to the vLLM endpoint.

    Returns the model's response text (spatial description).
    """

    # Build the multimodal message payload (OpenAI vision format)
    payload = {
        "model": settings.VLLM_MODEL,
        "messages": [
            {
                "role": "system",
                "content": settings.SYSTEM_PROMPT,
            },
            {
                "role": "user",
                "content": [
                    {
                        "type": "image_url",
                        "image_url": {
                            # vLLM / Qwen2-VL accepts data URIs
                            "url": f"data:image/jpeg;base64,{image_base64}",
                        },
                    },
                    {
                        "type": "text",
                        "text": user_prompt,
                    },
                ],
            },
        ],
        "max_tokens": 512,
        "temperature": 0.3,
    }

    logger.info("Querying vLLM at %s with model %s", settings.VLLM_ENDPOINT, settings.VLLM_MODEL)

    async with httpx.AsyncClient(timeout=settings.VLLM_TIMEOUT) as client:
        response = await client.post(
            settings.VLLM_ENDPOINT,
            json=payload,
            headers=_HEADERS,
        )

    if response.status_code != 200:
        logger.error("vLLM error %d: %s", response.status_code, response.text)
        raise RuntimeError(f"vLLM returned status {response.status_code}: {response.text}")

    data = response.json()
    description: str = data["choices"][0]["message"]["content"].strip()
    logger.info("vLLM response (%d chars): %s…", len(description), description[:120])
    return description
