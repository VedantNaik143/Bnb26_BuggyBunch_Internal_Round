import time
from typing import Optional, Tuple, Dict, Any
from backend.config import settings
from backend.storage.memory_store import (
    store,
    CaptionSegmentModel,
    DecisionLogModel,
    SessionModel,
    ParticipantModel
)
from backend.fusion.dedupe import DeduplicationEngine
from backend.fusion.overlap import OverlapDetector
from backend.fusion.confidence import ConfidenceEstimator
from backend.fusion.segments import SegmentTracker

class FusionEngine:
    def __init__(self):
        self.tracker = SegmentTracker()

    def process_speech_event(
        self,
        session_id: str,
        participant_id: str,
        text: str,
        is_final: bool,
        start_ms: int,
        end_ms: int,
        asr_latency_ms: int = 150
    ) -> Tuple[Optional[CaptionSegmentModel], str, Optional[Dict[str, Any]]]:
        """
        Processes incoming speech transcription from a device and performs evidence fusion.
        Returns:
            (segment, event_type, extra_event_data)
        """
        fusion_start_time = time.time()
        session = store.get_session(session_id)
        if not session or not text.strip():
            return None, "NOOP", None

        participant = store.get_participant(session_id, participant_id)
        if not participant:
            return None, "NOOP", None

        speaker_name = participant.displayName
        device_label = participant.deviceLabel
        device_id = participant.deviceId
        quality_score = participant.qualityScore

        # 1. Check for Active Provisional Segment Revision
        existing_seg_id = self.tracker.get_active_segment_id(session_id, participant_id)

        if existing_seg_id:
            # In-place revision of current segment
            status = "FINAL" if is_final else "UPDATED"
            confidence = ConfidenceEstimator.estimate(text, quality_score, is_final)
            updated_seg = store.update_segment(
                session_id,
                existing_seg_id,
                text=text,
                status=status,
                confidence=confidence,
                endMs=end_ms
            )

            if is_final:
                self.tracker.clear_active_segment(session_id, participant_id)
                session.metrics.correctionCount += 1
                event_type = "CAPTION_FINAL"
            else:
                self.tracker.update_touch(existing_seg_id)
                event_type = "CAPTION_UPDATED"

            # Compute and record real latency
            fusion_lat_ms = int((time.time() - fusion_start_time) * 1000)
            total_lat = asr_latency_ms + fusion_lat_ms
            store.record_latency(session_id, total_lat, asr_latency_ms, fusion_lat_ms)

            # Real telemetry log for in-place revision
            elapsed_sec = (start_ms / 1000.0) if start_ms > 0 else (time.time() - (session.startedAt / 1000.0))
            store.add_decision_log(
                session_id,
                DecisionLogModel(
                    time=f"{max(0.1, elapsed_sec):.1f}s",
                    devices=[f"{speaker_name} ({device_label})"],
                    text=f'"{text[:60]}..."' if len(text) > 60 else f'"{text}"',
                    similarity="Refined",
                    decision=f"In-place {status.lower()} revision on same segment ID ({existing_seg_id[:8]})",
                    type="revision"
                )
            )

            return updated_seg, event_type, None

        # 2. Check for Multi-Device Duplicate Echo
        is_dup, matching_seg, sim_score = DeduplicationEngine.check_duplicate(
            session=session,
            candidate_speaker_id=participant_id,
            candidate_text=text,
            candidate_start_ms=start_ms,
            candidate_rms=participant.audioLevel * 100.0
        )

        if is_dup and matching_seg:
            # Suppress duplicate echo, corroborate primary segment
            matching_seg.duplicateSourcesCount = (matching_seg.duplicateSourcesCount or 1) + 1
            session.metrics.deduplicatedEvents += 1

            elapsed_sec = (start_ms / 1000.0) if start_ms > 0 else (time.time() - (session.startedAt / 1000.0))
            store.add_decision_log(
                session_id,
                DecisionLogModel(
                    time=f"{max(0.1, elapsed_sec):.1f}s",
                    devices=[
                        f"{matching_seg.speakerName} ({matching_seg.sourceDeviceId})",
                        f"{speaker_name} ({device_label})"
                    ],
                    text=f'"{text[:60]}..."' if len(text) > 60 else f'"{text}"',
                    similarity=f"{int(sim_score * 100)}%",
                    decision=f"Duplicate echo suppressed · Retained {matching_seg.speakerName} (primary source)",
                    type="dedupe"
                )
            )

            # Return updated matching segment with higher corroboration
            return matching_seg, "CAPTION_UPDATED", None

        # 3. Check for Simultaneous Speech Overlap
        has_overlap, group_id = OverlapDetector.detect_overlap(
            session=session,
            candidate_speaker_id=participant_id,
            candidate_start_ms=start_ms,
            candidate_end_ms=end_ms,
            is_duplicate=is_dup
        )

        if has_overlap:
            session.metrics.overlapCount += 1
            elapsed_sec = (start_ms / 1000.0) if start_ms > 0 else (time.time() - (session.startedAt / 1000.0))
            store.add_decision_log(
                session_id,
                DecisionLogModel(
                    time=f"{max(0.1, elapsed_sec):.1f}s",
                    devices=[f"{speaker_name} ({device_label})"],
                    text=f'"{text[:60]}..."' if len(text) > 60 else f'"{text}"',
                    similarity="Distinct",
                    decision=f"Simultaneous speech detected (<{settings.OVERLAP_TIME_WINDOW_MS}ms) · Stacked overlap group",
                    type="overlap"
                )
            )

        # 4. Create New Caption Segment
        segment_id = f"seg-{int(time.time() * 1000)}-{participant_id[-4:]}"
        status = "FINAL" if is_final else "PROVISIONAL"
        confidence = ConfidenceEstimator.estimate(text, quality_score, is_final)

        new_segment = CaptionSegmentModel(
            segmentId=segment_id,
            sessionId=session_id,
            speakerId=participant_id,
            speakerName=speaker_name,
            sourceDeviceId=device_id,
            startMs=start_ms,
            endMs=end_ms,
            text=text,
            status=status,
            confidence=confidence,
            overlap=has_overlap,
            overlapGroupId=group_id,
            duplicateSourcesCount=1
        )

        store.add_segment(session_id, new_segment)

        if not is_final:
            self.tracker.set_active_segment_id(session_id, participant_id, segment_id)
            event_type = "CAPTION_CREATED"
        else:
            event_type = "CAPTION_FINAL"

        fusion_lat_ms = int((time.time() - fusion_start_time) * 1000)
        total_lat = asr_latency_ms + fusion_lat_ms
        store.record_latency(session_id, total_lat, asr_latency_ms, fusion_lat_ms)

        extra = {"overlapDetected": True, "groupId": group_id} if has_overlap else None
        return new_segment, event_type, extra

fusion_engine = FusionEngine()
