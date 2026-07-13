"""
Central configuration — reads from environment variables or .env file.
"""

from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    # -----------------------------------------------------------------------
    # vLLM (Vast.ai GPU endpoint)
    # -----------------------------------------------------------------------
    VLLM_ENDPOINT: str = "http://<VAST_AI_IP>:8000/v1/chat/completions"
    VLLM_MODEL: str = "Qwen/Qwen2-VL-7B-Instruct"
    VLLM_TIMEOUT: int = 60          # seconds

    # -----------------------------------------------------------------------
    # Whisper  (runs locally on backend server or via API)
    # -----------------------------------------------------------------------
    WHISPER_MODEL: str = "base"     # tiny | base | small | medium | large
    WHISPER_DEVICE: str = "cuda"    # cuda | cpu

    # -----------------------------------------------------------------------
    # TTS
    # -----------------------------------------------------------------------
    TTS_ENABLED: bool = True
    TTS_ENGINE: str = "gtts"        # gtts | pyttsx3 | coqui

    # -----------------------------------------------------------------------
    # System prompt injected before every vLLM call
    # -----------------------------------------------------------------------
    SYSTEM_PROMPT: str = (
        "You are an assistant for the visually impaired. "
        "Analyze the provided image. "
        "Do not just list objects; explicitly state their spatial positions "
        "relative to each other (left, right, top, bottom, front, back). "
        "Keep your sentences short, direct, and easy to understand when read aloud."
    )

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"


settings = Settings()
