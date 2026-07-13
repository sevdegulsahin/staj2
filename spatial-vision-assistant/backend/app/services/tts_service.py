"""
TTS Service — converts text to speech audio bytes (WAV).
Supports gTTS (Google TTS via HTTP) and pyttsx3 (offline).
"""

import io
import logging

from app.config import settings

logger = logging.getLogger(__name__)


async def synthesize_speech(text: str) -> bytes:
    """
    Convert ``text`` to WAV/MP3 bytes using the configured TTS engine.
    Returns raw audio bytes.
    """
    engine = settings.TTS_ENGINE.lower()

    if engine == "gtts":
        return await _gtts(text)
    elif engine == "pyttsx3":
        return _pyttsx3(text)
    elif engine == "coqui":
        return await _coqui(text)
    else:
        raise ValueError(f"Unknown TTS_ENGINE: {engine}")


# ---------------------------------------------------------------------------
# gTTS  (requires internet on the backend server)
# ---------------------------------------------------------------------------
async def _gtts(text: str) -> bytes:
    from gtts import gTTS

    buf = io.BytesIO()
    tts = gTTS(text=text, lang="en", slow=False)
    tts.write_to_fp(buf)
    buf.seek(0)
    logger.info("gTTS synthesis complete (%d bytes)", buf.getbuffer().nbytes)
    return buf.read()


# ---------------------------------------------------------------------------
# pyttsx3  (fully offline, runs on CPU)
# ---------------------------------------------------------------------------
def _pyttsx3(text: str) -> bytes:
    import pyttsx3
    import wave, struct, tempfile
    from pathlib import Path

    engine = pyttsx3.init()
    engine.setProperty("rate", 145)
    engine.setProperty("volume", 1.0)

    with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as tmp:
        tmp_path = Path(tmp.name)

    engine.save_to_file(text, str(tmp_path))
    engine.runAndWait()

    data = tmp_path.read_bytes()
    tmp_path.unlink(missing_ok=True)
    logger.info("pyttsx3 synthesis complete (%d bytes)", len(data))
    return data


# ---------------------------------------------------------------------------
# Coqui TTS  (high quality, local neural TTS)
# ---------------------------------------------------------------------------
async def _coqui(text: str) -> bytes:
    from TTS.api import TTS
    import soundfile as sf
    import tempfile
    from pathlib import Path
    import numpy as np

    tts = TTS(model_name="tts_models/en/ljspeech/tacotron2-DDC", progress_bar=False)

    with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as tmp:
        tmp_path = Path(tmp.name)

    tts.tts_to_file(text=text, file_path=str(tmp_path))
    data = tmp_path.read_bytes()
    tmp_path.unlink(missing_ok=True)
    logger.info("Coqui TTS synthesis complete (%d bytes)", len(data))
    return data
