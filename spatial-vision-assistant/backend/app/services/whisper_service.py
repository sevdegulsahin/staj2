"""
Whisper Service — transcribes raw audio bytes to text.
Uses the `faster-whisper` library for GPU-accelerated inference.
"""

import io
import logging
import tempfile
from pathlib import Path

from faster_whisper import WhisperModel

from app.config import settings

logger = logging.getLogger(__name__)

# Lazy-load the model so it only loads once (singleton pattern)
_model: WhisperModel | None = None


def _get_model() -> WhisperModel:
    global _model
    if _model is None:
        logger.info(
            "Loading Whisper model '%s' on device '%s'",
            settings.WHISPER_MODEL,
            settings.WHISPER_DEVICE,
        )
        _model = WhisperModel(
            settings.WHISPER_MODEL,
            device=settings.WHISPER_DEVICE,
            compute_type="float16" if settings.WHISPER_DEVICE == "cuda" else "int8",
        )
    return _model


async def transcribe_audio(audio_bytes: bytes) -> str:
    """
    Accepts raw audio bytes (WAV / MP3 / M4A).
    Returns transcribed text string.
    """
    model = _get_model()

    # Write to a temp file because faster-whisper expects a file path
    with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as tmp:
        tmp.write(audio_bytes)
        tmp_path = Path(tmp.name)

    try:
        segments, info = model.transcribe(
            str(tmp_path),
            beam_size=5,
            language=None,          # auto-detect language
            vad_filter=True,        # remove silence
        )
        transcript = " ".join(seg.text.strip() for seg in segments).strip()
        logger.info(
            "Whisper detected lang=%s | transcript=%s",
            info.language,
            transcript[:120],
        )
        return transcript or "What do you see?"
    finally:
        tmp_path.unlink(missing_ok=True)
