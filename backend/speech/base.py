from abc import ABC, abstractmethod
from typing import Callable, Awaitable, Any

# Callback signature: (session_id, participant_id, text, is_final, start_ms, end_ms, latency_ms) -> Awaitable[None]
SpeechCallback = Callable[[str, str, str, bool, int, int, int], Awaitable[None]]

class SpeechProvider(ABC):
    @abstractmethod
    async def open_session(
        self,
        session_id: str,
        participant_id: str,
        on_speech_event: SpeechCallback
    ) -> bool:
        """Opens a realtime streaming speech session for a participant."""
        pass

    @abstractmethod
    async def send_audio(
        self,
        session_id: str,
        participant_id: str,
        pcm_data: bytes,
        start_ms: int,
        end_ms: int
    ) -> None:
        """Sends a chunk of 16kHz PCM mono audio."""
        pass

    @abstractmethod
    async def close_session(
        self,
        session_id: str,
        participant_id: str
    ) -> None:
        """Closes the realtime session and cleans up resources."""
        pass
