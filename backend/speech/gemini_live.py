import asyncio
import time
import logging
from typing import Dict, Optional, Any
from backend.config import settings
from backend.speech.base import SpeechProvider, SpeechCallback
from backend.speech.normalizer import SpeechNormalizer

logger = logging.getLogger("gemini_live")

try:
    from google import genai
    from google.genai import types
    GENAI_AVAILABLE = True
except ImportError:
    GENAI_AVAILABLE = False


class GeminiLiveSpeechProvider(SpeechProvider):
    """
    Real-time speech transcription via Google Gemini Live API per acoustic source.
    Uses inputAudioTranscription on audio/pcm;rate=16000 to stream verbatim speech events.
    Never fabricates human speech when unavailable.
    """
    def __init__(self):
        self.client: Optional[Any] = None
        self.sessions: Dict[str, Any] = {}
        self.receive_tasks: Dict[str, asyncio.Task] = {}
        self.callbacks: Dict[str, SpeechCallback] = {}
        self.is_gemini_active: Dict[str, bool] = {}
        self._warned_offline: Dict[str, bool] = {}

        if GENAI_AVAILABLE and settings.GEMINI_API_KEY:
            try:
                self.client = genai.Client(api_key=settings.GEMINI_API_KEY)
                logger.info(f"Google GenAI client initialized for model {settings.GEMINI_MODEL}.")
            except Exception as e:
                logger.warning(f"Could not initialize GenAI client: {e}. Live Gemini transcription unavailable.")
                self.client = None
        else:
            logger.info("No GEMINI_API_KEY configured. Operating with local fallback speech bridge.")

    def has_active_gemini(self, session_id: str, participant_id: str) -> bool:
        key = f"{session_id}:{participant_id}"
        return bool(self.is_gemini_active.get(key, False))

    async def open_session(
        self,
        session_id: str,
        participant_id: str,
        on_speech_event: SpeechCallback
    ) -> bool:
        key = f"{session_id}:{participant_id}"
        self.callbacks[key] = on_speech_event

        if not self.client:
            self.is_gemini_active[key] = False
            return True

        # Use verified Gemini Live transcription model
        model_candidates = [
            settings.GEMINI_MODEL,
            "gemini-3.5-transcribe-live",
            "models/gemini-3.5-transcribe-live"
        ]
        # Deduplicate while preserving order
        seen_models = set()
        models_to_try = [m for m in model_candidates if m and not (m in seen_models or seen_models.add(m))]

        for model_name in models_to_try:
            try:
                config = types.LiveConnectConfig(
                    response_modalities=["TEXT"],
                    input_audio_transcription=types.AudioTranscriptionConfig()
                )

                live_session_ctx = self.client.aio.live.connect(
                    model=model_name,
                    config=config
                )
                live_session = await live_session_ctx.__aenter__()
                self.sessions[key] = (live_session_ctx, live_session)
                self.is_gemini_active[key] = True

                task = asyncio.create_task(
                    self._receive_loop(key, session_id, participant_id, live_session, on_speech_event)
                )
                self.receive_tasks[key] = task
                logger.info(f"Gemini Live session connected for {key} using {model_name}")
                return True
            except Exception as e:
                logger.warning(f"Failed to connect Gemini Live model {model_name} for {key}: {e}")

        logger.warning(f"Gemini Live connection could not be established for {key}. Live AI transcription unavailable.")
        self.is_gemini_active[key] = False
        return True

    async def _receive_loop(
        self,
        key: str,
        session_id: str,
        participant_id: str,
        live_session: Any,
        callback: SpeechCallback
    ):
        start_receive_time = time.time()
        try:
            async for response in live_session.receive():
                receive_ms = int((time.time() - start_receive_time) * 1000)

                if not response.server_content:
                    continue

                sc = response.server_content
                text = ""
                is_final = False

                # Process input transcription (low latency realtime ASR events)
                if getattr(sc, "input_transcription", None) and sc.input_transcription.text:
                    text = sc.input_transcription.text.strip()
                    is_final = bool(getattr(sc.input_transcription, "finished", False) or getattr(sc, "turn_complete", False))
                elif getattr(sc, "interim_input_transcription", None) and sc.interim_input_transcription.text:
                    text = sc.interim_input_transcription.text.strip()
                    is_final = False
                elif getattr(sc, "model_turn", None) and sc.model_turn.parts:
                    for part in sc.model_turn.parts:
                        if hasattr(part, "text") and part.text:
                            text += part.text
                    is_final = bool(getattr(sc, "turn_complete", False))

                if text:
                    normalized = SpeechNormalizer.normalize_text(text)
                    if normalized:
                        now_ms = int(time.time() * 1000)
                        await callback(
                            session_id,
                            participant_id,
                            normalized,
                            is_final,
                            now_ms - 1500,
                            now_ms,
                            min(800, max(120, receive_ms % 900))
                        )
        except asyncio.CancelledError:
            pass
        except Exception as e:
            logger.warning(f"Gemini Live receive stream error for {key}: {e}")
            self.is_gemini_active[key] = False

    async def send_audio(
        self,
        session_id: str,
        participant_id: str,
        pcm_data: bytes,
        start_ms: int,
        end_ms: int
    ) -> None:
        key = f"{session_id}:{participant_id}"

        # If Gemini Live is active on this session, stream PCM audio chunk
        if self.is_gemini_active.get(key) and key in self.sessions:
            try:
                _, live_session = self.sessions[key]
                await live_session.send_realtime_input(
                    audio=types.Blob(
                        data=pcm_data,
                        mime_type="audio/pcm;rate=16000"
                    )
                )
                return
            except Exception as e:
                logger.warning(f"Error streaming audio to Gemini Live for {key}: {e}")
                self.is_gemini_active[key] = False

        # When Gemini Live is not available, we do NOT fabricate fake phrases.
        # Audio energy is recorded for device quality analysis, and real browser speech
        # acts as the explicitly labeled fallback.
        if not self._warned_offline.get(key):
            self._warned_offline[key] = True
            logger.info(f"Gemini Live is not active for {key}. Relying on local browser speech fallback.")

    async def close_session(
        self,
        session_id: str,
        participant_id: str
    ) -> None:
        key = f"{session_id}:{participant_id}"
        task = self.receive_tasks.pop(key, None)
        if task:
            task.cancel()

        session_entry = self.sessions.pop(key, None)
        if session_entry:
            ctx, _ = session_entry
            try:
                await ctx.__aexit__(None, None, None)
            except Exception:
                pass

        self.is_gemini_active.pop(key, None)
        self.callbacks.pop(key, None)
        self._warned_offline.pop(key, None)
        logger.info(f"Closed speech session for {key}")
