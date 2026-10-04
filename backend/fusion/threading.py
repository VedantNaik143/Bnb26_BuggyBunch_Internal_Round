import time
import logging
from typing import List, Dict, Optional
from backend.storage.memory_store import CaptionSegmentModel, ConversationThreadModel

logger = logging.getLogger("conversation_threading")

class ConversationThreadManager:
    """
    Groups speech segments into conversation threads:
    MAIN_CONVERSATION, SIDE_CONVERSATION, OVERLAP, UNKNOWN.
    Maintains continuity across turns without creating a new thread for each sentence.
    """
    def __init__(self):
        # session_id -> List[ConversationThreadModel]
        self.session_threads: Dict[str, List[ConversationThreadModel]] = {}

    def get_threads(self, session_id: str) -> List[ConversationThreadModel]:
        return self.session_threads.get(session_id, [])

    def process_segment(
        self,
        session_id: str,
        segment: CaptionSegmentModel,
        is_host: bool = False
    ) -> List[ConversationThreadModel]:
        threads = self.session_threads.setdefault(session_id, [])
        now_ms = segment.startMs if segment.startMs > 0 else int(time.time() * 1000)

        # 1. Handle Overlaps specifically
        if segment.overlap:
            overlap_thread = self._find_or_create_overlap_thread(threads, segment, now_ms)
            self._add_segment_to_thread(overlap_thread, segment, now_ms)
            return threads

        # 2. Check if this belongs to an existing active thread
        target_thread = None

        # Look for recent thread (within 8000ms) with matching speaker or participant pair
        for thread in reversed(threads):
            time_since_last = now_ms - thread.lastUpdate
            if time_since_last > 12000:
                continue

            # Speaker continuity: speaker was in this thread
            if segment.speakerId in thread.speakerIds:
                target_thread = thread
                break

            # If host or main conversation continuity
            if is_host and thread.threadType == "MAIN_CONVERSATION":
                target_thread = thread
                break

            # If recent interaction between non-host speakers
            if thread.threadType == "SIDE_CONVERSATION" and len(thread.speakerIds) < 3:
                target_thread = thread
                break

        # 3. If no matching recent thread, determine thread type
        if not target_thread:
            # Check if there is an active main thread running right now
            active_main = next(
                (t for t in reversed(threads) if t.threadType == "MAIN_CONVERSATION" and (now_ms - t.lastUpdate) < 10000),
                None
            )

            if is_host or not active_main:
                # Primary discussion
                thread_type = "MAIN_CONVERSATION"
                topic = "Main Meeting Agenda"
            else:
                # Concurrent secondary discussion while main conversation is active
                thread_type = "SIDE_CONVERSATION"
                topic = f"Sidebar: {segment.speakerName}"

            target_thread = ConversationThreadModel(
                threadId=f"th-{int(time.time())}-{len(threads) + 1}",
                threadType=thread_type,
                speakerIds=[segment.speakerId],
                speakerNames=[segment.speakerName],
                startTime=now_ms,
                lastUpdate=now_ms,
                recentSegments=[],
                topic=topic,
                summary="",
                confidence=segment.confidence
            )
            threads.append(target_thread)

        self._add_segment_to_thread(target_thread, segment, now_ms)
        return threads

    def _find_or_create_overlap_thread(
        self,
        threads: List[ConversationThreadModel],
        segment: CaptionSegmentModel,
        now_ms: int
    ) -> ConversationThreadModel:
        # Match by overlapGroupId if present
        if segment.overlapGroupId:
            for thread in threads:
                if thread.threadId == f"th-overlap-{segment.overlapGroupId}":
                    return thread

        overlap_thread = ConversationThreadModel(
            threadId=f"th-overlap-{segment.overlapGroupId or int(time.time())}",
            threadType="OVERLAP",
            speakerIds=[segment.speakerId],
            speakerNames=[segment.speakerName],
            startTime=now_ms,
            lastUpdate=now_ms,
            recentSegments=[],
            topic="Simultaneous Overlap",
            summary="Multiple speakers speaking simultaneously.",
            confidence="medium"
        )
        threads.append(overlap_thread)
        return overlap_thread

    def _add_segment_to_thread(
        self,
        thread: ConversationThreadModel,
        segment: CaptionSegmentModel,
        now_ms: int
    ):
        thread.lastUpdate = now_ms

        if segment.speakerId not in thread.speakerIds:
            thread.speakerIds.append(segment.speakerId)
        if segment.speakerName not in thread.speakerNames:
            thread.speakerNames.append(segment.speakerName)

        # Update or append segment in recentSegments
        existing_idx = next(
            (i for i, s in enumerate(thread.recentSegments) if s.segmentId == segment.segmentId),
            None
        )
        if existing_idx is not None:
            thread.recentSegments[existing_idx] = segment
        else:
            thread.recentSegments.append(segment)
            # Retain up to 8 recent segments per thread
            if len(thread.recentSegments) > 8:
                thread.recentSegments.pop(0)

thread_manager = ConversationThreadManager()
