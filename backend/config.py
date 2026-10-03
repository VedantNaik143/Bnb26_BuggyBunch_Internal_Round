import os
from pydantic_settings import BaseSettings
from dotenv import load_dotenv

load_dotenv()

class Settings(BaseSettings):
    GEMINI_API_KEY: str = os.getenv("GEMINI_API_KEY", "")
    GEMINI_MODEL: str = os.getenv("GEMINI_MODEL", "gemini-2.0-flash")
    HOST: str = os.getenv("HOST", "0.0.0.0")
    PORT: int = int(os.getenv("PORT", "8000"))
    
    # Audio settings
    SAMPLE_RATE: int = 16000
    CHANNELS: int = 1
    BYTES_PER_SAMPLE: int = 2  # 16-bit PCM
    CHUNK_DURATION_MS: int = 100
    
    # Practical Fusion Thresholds
    DUPLICATE_TIME_WINDOW_MS: int = 2500
    DUPLICATE_SIMILARITY_THRESHOLD: float = 0.70
    OVERLAP_TIME_WINDOW_MS: int = 1800
    
    # Heartbeat
    HEARTBEAT_INTERVAL_SEC: int = 15
    HEARTBEAT_TIMEOUT_SEC: int = 35

settings = Settings()
