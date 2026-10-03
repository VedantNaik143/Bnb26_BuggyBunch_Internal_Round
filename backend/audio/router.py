import time
import logging
from typing import Optional
from backend.storage.memory_store import store
from backend.audio.quality import AudioQualityAnalyzer
from backend.speech.gemini_live import GeminiLiveSpeechProvider

logger = logging.getLogger("audio_router")

class AudioRouter:
    def __init__(self, speech_provider: GeminiLiveSpeechProvider):
        self.speech_provider = speech_provider

    async def handle_pcm_chunk(
        self,
        session_id: str,
        participant_id: str,
        pcm_bytes: bytes,
        start_ms: int,
        end_ms: int
    ) -> tuple[int, int, str]:
        """
        Analyzes PCM16 audio, updates participant metrics, and forwards to speech provider.
        Returns:
            (audio_level_0_to_100, quality_score, quality_tier)
        """
        # Analyze signal
        rms, level, tier, score = AudioQualityAnalyzer.analyze_pcm16(pcm_bytes)

        # Update store with genuine measurements
        store.update_participant(
            session_id=session_id,
            participant_id=participant_id,
            audio_level=level,
            quality_score=score
        )

        # Forward to speech recognition engine
        await self.speech_provider.send_audio(
            session_id=session_id,
            participant_id=participant_id,
            pcm_data=pcm_bytes,
            start_ms=start_ms,
            end_ms=end_ms
        )

        return level, score, tier
