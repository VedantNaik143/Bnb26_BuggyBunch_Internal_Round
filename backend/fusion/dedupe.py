import difflib
from typing import Optional, Tuple
from backend.config import settings
from backend.storage.memory_store import CaptionSegmentModel, SessionModel

class DeduplicationEngine:
    @staticmethod
    def calculate_similarity(text_a: str, text_b: str) -> float:
        """Computes character and token similarity using difflib SequenceMatcher."""
        if not text_a or not text_b:
            return 0.0
        matcher = difflib.SequenceMatcher(None, text_a.lower().strip(), text_b.lower().strip())
        return matcher.ratio()

    @classmethod
    def check_duplicate(
        cls,
        session: SessionModel,
        candidate_speaker_id: str,
        candidate_text: str,
        candidate_start_ms: int,
        candidate_rms: float
    ) -> Tuple[bool, Optional[CaptionSegmentModel], float]:
        """
        Checks if candidate speech utterance from one device is an acoustic duplicate
        of a recent utterance from another device in the room.
        Returns:
            (is_duplicate, existing_matching_segment, similarity_score)
        """
        window_ms = settings.DUPLICATE_TIME_WINDOW_MS
        threshold = settings.DUPLICATE_SIMILARITY_THRESHOLD

        # Look back at recent segments in the session
        recent_segments = [
            s for s in session.transcriptSegments[-10:]
            if abs(s.startMs - candidate_start_ms) <= window_ms
        ]

        best_match = None
        best_similarity = 0.0

        for seg in recent_segments:
            # Utterances from the SAME speaker segment are revisions, not duplicates
            if seg.speakerId == candidate_speaker_id:
                continue

            similarity = cls.calculate_similarity(seg.text, candidate_text)
            if similarity > best_similarity:
                best_similarity = similarity
                best_match = seg

        if best_match and best_similarity >= threshold:
            return True, best_match, best_similarity

        return False, None, best_similarity
