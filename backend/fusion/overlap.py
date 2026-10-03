import time
from typing import Optional, Tuple
from backend.config import settings
from backend.storage.memory_store import CaptionSegmentModel, SessionModel

class OverlapDetector:
    @staticmethod
    def detect_overlap(
        session: SessionModel,
        candidate_speaker_id: str,
        candidate_start_ms: int,
        candidate_end_ms: int,
        is_duplicate: bool
    ) -> Tuple[bool, Optional[str]]:
        """
        Detects if another distinct participant was actively speaking simultaneously.
        If so, returns (True, overlap_group_id).
        """
        if is_duplicate:
            return False, None

        window_ms = settings.OVERLAP_TIME_WINDOW_MS
        overlapping_segments = [
            s for s in session.transcriptSegments[-8:]
            if s.speakerId != candidate_speaker_id
            and (
                abs(s.startMs - candidate_start_ms) <= window_ms
                or (s.startMs <= candidate_end_ms and s.endMs >= candidate_start_ms)
            )
        ]

        if overlapping_segments:
            # Re-use existing group ID if available, otherwise generate new
            existing_group_id = None
            for s in overlapping_segments:
                if s.overlapGroupId:
                    existing_group_id = s.overlapGroupId
                    break

            group_id = existing_group_id or f"grp-{int(time.time() * 1000)}"
            for s in overlapping_segments:
                s.overlap = True
                s.overlapGroupId = group_id

            return True, group_id

        return False, None
