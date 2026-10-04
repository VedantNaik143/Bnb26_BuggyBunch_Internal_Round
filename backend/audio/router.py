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
        self.chunk_counts: dict[str, int] = {}

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
        key = f"{session_id}:{participant_id}"
        self.chunk_counts[key] = self.chunk_counts.get(key, 0) + 1
        count = self.chunk_counts[key]

        # Log chunk metrics (first 5 chunks, then every 50 chunks)
        if count <= 5 or count % 50 == 0:
            duration_ms = len(pcm_bytes) // 32  # 16000Hz * 1ch * 2bytes/sample = 32 bytes/ms
            logger.info(
                f"[AudioRouter] audio chunks received: {count} | "
                f"bytes received: {len(pcm_bytes)} | "
                f"participant_id: {participant_id} | "
                f"sample format: mono PCM16 16000Hz | "
                f"chunk duration: {duration_ms}ms"
            )

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
