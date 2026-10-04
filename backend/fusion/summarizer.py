import time
import asyncio
import logging
from typing import List, Optional
from backend.config import settings
from backend.storage.memory_store import ConversationThreadModel

logger = logging.getLogger("rolling_summarizer")

try:
    from google import genai
    from google.genai import types
    GENAI_AVAILABLE = True
except ImportError:
    GENAI_AVAILABLE = False


class RollingSummarizer:
    """
    Generates concise, factual rolling summaries for conversation threads (especially SIDE_CONVERSATION).
    Never fabricates facts; batches finalized segments; updates asynchronously.
    """
    def __init__(self):
        self.client: Optional[Any] = None
        self._last_summary_time: dict = {}

        if GENAI_AVAILABLE and settings.GEMINI_API_KEY:
            try:
                self.client = genai.Client(api_key=settings.GEMINI_API_KEY)
            except Exception:
                self.client = None

    async def maybe_summarize_threads(
        self,
        threads: List[ConversationThreadModel]
    ) -> bool:
        """
        Evaluates active threads and generates rolling summaries for threads that have new finalized speech.
        Returns True if any thread summary was updated.
        """
        updated = False

        for thread in threads:
            # We especially focus on side conversations and multi-speaker main discussions
            final_segments = [s for s in thread.recentSegments if s.status == "FINAL"]
            if len(final_segments) < 2:
                continue

            last_time = self._last_summary_time.get(thread.threadId, 0)
            now = time.time()
            # Summarize at most once every 6 seconds per thread to prevent thrashing
            if now - last_time < 6.0:
                continue

            self._last_summary_time[thread.threadId] = now
            new_summary, new_topic = await self._generate_summary(thread, final_segments)

            if new_summary and new_summary != thread.summary:
                thread.summary = new_summary
                if new_topic:
                    thread.topic = new_topic
                updated = True

        return updated

    async def _generate_summary(
        self,
        thread: ConversationThreadModel,
        segments: List
    ) -> tuple[str, str]:
        speaker_names = ", ".join(thread.speakerNames)
        dialogue = "\n".join([f"{s.speakerName}: {s.text}" for s in segments[-4:]])

        # 1. Attempt using Gemini fast text model if API is configured
        if self.client:
            try:
                prompt = (
                    f"You are the Roundtable acoustic fusion AI. Below is a live transcript snippet from {thread.threadType} "
                    f"involving {speaker_names}:\n\n"
                    f"{dialogue}\n\n"
                    f"Provide a 1-sentence concise factual summary of what they are discussing. "
                    f"Format: Topic: <3 words> | Summary: <1 concise factual sentence>. "
                    f"Never invent information not stated in the text."
                )

                # Use fast text model (e.g. gemini-2.0-flash)
                response = await self.client.aio.models.generate_content(
                    model="gemini-2.0-flash",
                    contents=prompt
                )

                if response and response.text:
                    raw = response.text.strip()
                    if "|" in raw:
                        parts = raw.split("|", 1)
                        topic = parts[0].replace("Topic:", "").strip()
                        summary = parts[1].replace("Summary:", "").strip()
                        return summary, topic
                    return raw, thread.topic
            except Exception as e:
                logger.debug(f"Gemini rolling summary notice: {e}. Using extractive fallback.")

        # 2. Honest extractive fallback
        latest_text = segments[-1].text if segments else ""
        if len(latest_text) > 80:
            latest_text = latest_text[:77] + "..."
        summary = f"{speaker_names} discussing: \"{latest_text}\""
        topic = f"{thread.threadType.replace('_', ' ').title()}"
        return summary, topic


rolling_summarizer = RollingSummarizer()
