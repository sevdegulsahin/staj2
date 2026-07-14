"""
Spatial Vision Assistant — FastAPI Backend
Handles: image + voice prompt → vLLM (Qwen2-VL) → spatial description text
"""

import base64
import logging
from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from typing import List, Optional

from app.config import settings
from app.services.whisper_service import transcribe_audio
from app.services.vlm_service import query_vlm
from app.services.tts_service import synthesize_speech



# ---------------------------------------------------------------------------
# Logging
# ---------------------------------------------------------------------------
logging.basicConfig(level=logging.INFO, format="%(asctime)s  %(levelname)s  %(message)s")
logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# App
# ---------------------------------------------------------------------------
app = FastAPI(
    title="Spatial Vision Assistant API",
    description="AI backend for visually impaired spatial awareness",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],          # tighten in production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)



# ---------------------------------------------------------------------------
# Schemas
# ---------------------------------------------------------------------------
class Message(BaseModel):
    role: str
    content: str

class VisionRequest(BaseModel):
    image_base64: str       # JPEG/PNG encoded as base64 string
    user_prompt: str        # already-transcribed text question (optional path)
    history: Optional[List[Message]] = []

class VisionResponse(BaseModel):
    description: str        # spatial description to read aloud
    audio_base64: str | None = None  # optional TTS wav, base64-encoded


class AudioVisionRequest(BaseModel):
    image_base64: str       # JPEG/PNG as base64
    audio_base64: str       # WAV/MP3 as base64 (raw voice recording)
    history: Optional[List[Message]] = []


# ---------------------------------------------------------------------------
# Health
# ---------------------------------------------------------------------------
@app.get("/health")
async def health():
    return {"status": "ok", "vllm_endpoint": settings.VLLM_ENDPOINT}


# ---------------------------------------------------------------------------
# Main endpoint — text prompt already transcribed on device
# ---------------------------------------------------------------------------
@app.post("/analyze", response_model=VisionResponse)
async def analyze(req: VisionRequest):
    """
    Accepts base64 image + user text prompt.
    Returns spatial description + optional TTS audio.
    """
    logger.info("Received /analyze request | prompt=%s", req.user_prompt[:80])

    if not req.image_base64:
        raise HTTPException(status_code=400, detail="image_base64 is required")
    if not req.user_prompt.strip():
        raise HTTPException(status_code=400, detail="user_prompt is required")

    description = await query_vlm(req.image_base64, req.user_prompt, req.history)

    audio_b64 = None
    if settings.TTS_ENABLED:
        audio_bytes = await synthesize_speech(description)
        audio_b64 = base64.b64encode(audio_bytes).decode()

    return VisionResponse(description=description, audio_base64=audio_b64)


# ---------------------------------------------------------------------------
# Full pipeline — audio recording + image on backend
# ---------------------------------------------------------------------------
@app.post("/analyze-voice", response_model=VisionResponse)
async def analyze_voice(req: AudioVisionRequest):
    """
    Accepts base64 audio recording + base64 image.
    Transcribes voice on backend (Whisper), then queries vLLM.
    """
    logger.info("Received /analyze-voice request")

    audio_bytes = base64.b64decode(req.audio_base64)
    user_prompt = await transcribe_audio(audio_bytes)
    logger.info("Whisper transcript: %s", user_prompt)

    description = await query_vlm(req.image_base64, user_prompt, req.history)

    audio_b64 = None
    if settings.TTS_ENABLED:
        audio_bytes_out = await synthesize_speech(description)
        audio_b64 = base64.b64encode(audio_bytes_out).decode()

    return VisionResponse(description=description, audio_base64=audio_b64)


# ---------------------------------------------------------------------------
# Static frontend — MUST be mounted LAST so API routes take priority
# ---------------------------------------------------------------------------
_FRONTEND_DIR = Path(__file__).parent.parent / "frontend"
if _FRONTEND_DIR.exists():
    app.mount("/", StaticFiles(directory=str(_FRONTEND_DIR), html=True), name="frontend")
