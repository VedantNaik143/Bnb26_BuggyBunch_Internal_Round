import time
import asyncio
from typing import Optional, Tuple, Dict, Any, List
from backend.config import settings
from backend.storage.memory_store import (
    store,
    CaptionSegmentModel,
    DecisionLogModel,
    SessionModel,
    ParticipantModel,
    ConversationThreadModel
)
from backend.fusion.dedupe import DeduplicationEngine
from backend.fusion.overlap import OverlapDetector
from backend.fusion.confidence import ConfidenceEstimator
from backend.fusion.segments import SegmentTracker
from backend.fusion.threading import thread_manager
from backend.fusion.summarizer import rolling_summarizer

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
        Processes incoming speech transcription from a device and performs evidence fusion:
        1. In-place provisional revisions (same segmentId)
        2. Cross-device echo deduplication & corroboration (tracks corroboratingDevices)
        3. Simultaneous speech overlap detection (generates overlapGroupId)
        4. Conversation thread clustering & rolling summarization
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
        candidate_rms = float(getattr(participant, "audioLevel", 0) * 10.0)

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

            # Update conversation thread
            if updated_seg:
                threads = thread_manager.process_segment(session_id, updated_seg, is_host=participant.isHost)
                store.update_threads(session_id, threads)

            return updated_seg, event_type, None

        # 2. Check for Multi-Device Duplicate Echo
        is_dup, matching_seg, sim_score = DeduplicationEngine.check_duplicate(
            session=session,
            candidate_speaker_id=participant_id,
            candidate_text=text,
            candidate_start_ms=start_ms,
            candidate_rms=candidate_rms
        )

        if is_dup and matching_seg:
            # Multi-device corroboration: record that this device also heard the speech
            matching_seg.duplicateSourcesCount = (matching_seg.duplicateSourcesCount or 1) + 1
            if device_label not in matching_seg.corroboratingDevices:
                matching_seg.corroboratingDevices.append(device_label)
            if matching_seg.sourceDeviceId not in matching_seg.corroboratingDevices:
                matching_seg.corroboratingDevices.insert(0, matching_seg.sourceDeviceId)

            session.metrics.deduplicatedEvents += 1

            # Multi-device corroboration grants high confidence
            matching_seg.confidence = "high"

            # If candidate text is more complete, adopt clearer verbatim text
            if len(text) > len(matching_seg.text):
                matching_seg.text = text

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
                    decision=f"Duplicate echo suppressed · Corroborated by {len(matching_seg.corroboratingDevices)} devices (attributed to {matching_seg.speakerName})",
                    type="dedupe"
                )
            )

            # Update conversation thread
            threads = thread_manager.process_segment(session_id, matching_seg, is_host=participant.isHost)
            store.update_threads(session_id, threads)

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
                    decision=f"Simultaneous speech detected (<{settings.OVERLAP_TIME_WINDOW_MS}ms) · Stacked parallel overlap card",
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
            sourceDeviceId=device_label,
            startMs=start_ms,
            endMs=end_ms,
            text=text,
            status=status,
            confidence=confidence,
            overlap=has_overlap,
            overlapGroupId=group_id,
            duplicateSourcesCount=1,
            corroboratingDevices=[device_label],
            engine=session.activeEngine,
            sourceQualityRms=candidate_rms
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

        # 5. Process Conversation Threading
        threads = thread_manager.process_segment(session_id, new_segment, is_host=participant.isHost)
        store.update_threads(session_id, threads)

        extra = {
            "overlapDetected": has_overlap,
            "groupId": group_id,
            "threads": [t.model_dump() for t in threads]
        }
        return new_segment, event_type, extra

fusion_engine = FusionEngine()
