import time
from typing import Dict, Optional

class SegmentTracker:
    def __init__(self):
        # Maps (session_id, participant_id) -> active_segment_id
        self.active_segments: Dict[str, str] = {}
        self.segment_timestamps: Dict[str, float] = {}

    def get_active_segment_id(self, session_id: str, participant_id: str) -> Optional[str]:
        key = f"{session_id}:{participant_id}"
        seg_id = self.active_segments.get(key)
        if seg_id:
            last_time = self.segment_timestamps.get(seg_id, 0)
            # If segment is older than 5 seconds without finalizing, expire it
            if time.time() - last_time > 5.0:
                self.clear_active_segment(session_id, participant_id)
                return None
        return seg_id

    def set_active_segment_id(self, session_id: str, participant_id: str, segment_id: str):
        key = f"{session_id}:{participant_id}"
        self.active_segments[key] = segment_id
        self.segment_timestamps[segment_id] = time.time()

    def update_touch(self, segment_id: str):
        self.segment_timestamps[segment_id] = time.time()

    def clear_active_segment(self, session_id: str, participant_id: str):
        key = f"{session_id}:{participant_id}"
        seg_id = self.active_segments.pop(key, None)
        if seg_id:
            self.segment_timestamps.pop(seg_id, None)
