import time
import random
import string
from typing import Dict, List, Optional, Any
from pydantic import BaseModel, Field

class ParticipantModel(BaseModel):
    participantId: str
    displayName: str
    deviceId: str
    deviceType: str = "laptop"  # mobile, laptop, desktop, tablet
    deviceLabel: str = "Device Microphone"
    joinedAt: int = Field(default_factory=lambda: int(time.time() * 1000))
    lastSeenAt: int = Field(default_factory=lambda: int(time.time() * 1000))
    connectionState: str = "CONNECTED"  # CONNECTED, TEMPORARILY_LOST, DISCONNECTED
    microphoneState: str = "ACTIVE"     # ACTIVE, MUTED, NOISY
    qualityScore: int = 95              # 0 - 100
    isHost: bool = False
    isLocal: bool = False
    audioLevel: int = 0                 # 0 - 100
    tableAngle: int = 0                 # 0 - 360 deg
    speechHistoryCount: int = 0
    totalSpeechDurationMs: int = 0

class CaptionSegmentModel(BaseModel):
    segmentId: str
    sessionId: str
    speakerId: str
    speakerName: str
    sourceDeviceId: str
    startMs: int
    endMs: int
    text: str
    status: str = "PROVISIONAL"         # PROVISIONAL, UPDATED, FINAL
    confidence: str = "high"            # high, medium, low
    overlap: bool = False
    overlapGroupId: Optional[str] = None
    createdAt: int = Field(default_factory=lambda: int(time.time() * 1000))
    updatedAt: int = Field(default_factory=lambda: int(time.time() * 1000))
    duplicateSourcesCount: int = 1
    corroboratingDevices: List[str] = Field(default_factory=list)
    engine: str = "GEMINI_LIVE"
    sourceQualityRms: float = 0.0

class ConversationThreadModel(BaseModel):
    threadId: str
    threadType: str = "MAIN_CONVERSATION"  # MAIN_CONVERSATION, SIDE_CONVERSATION, OVERLAP, UNKNOWN
    speakerIds: List[str] = Field(default_factory=list)
    speakerNames: List[str] = Field(default_factory=list)
    startTime: int = Field(default_factory=lambda: int(time.time() * 1000))
    lastUpdate: int = Field(default_factory=lambda: int(time.time() * 1000))
    recentSegments: List[CaptionSegmentModel] = Field(default_factory=list)
    topic: str = "General Discussion"
    summary: str = ""
    confidence: str = "high"

class DecisionLogModel(BaseModel):
    time: str
    devices: List[str]
    text: str
    similarity: str
    decision: str
    type: str  # dedupe, overlap, revision, quality

class SessionMetricsModel(BaseModel):
    medianLatencyMs: int = 0
    p95LatencyMs: int = 0
    speechEvents: int = 0
    correctionCount: int = 0
    overlapCount: int = 0
    deduplicatedEvents: int = 0
    connectedDevices: int = 0
    audioChunkLatencyMs: int = 0
    asrLatencyMs: int = 0
    fusionLatencyMs: int = 0
    measuredLatencies: List[int] = Field(default_factory=list)

class SessionModel(BaseModel):
    sessionId: str
    joinCode: str
    name: str
    createdAt: int = Field(default_factory=lambda: int(time.time() * 1000))
    startedAt: int = Field(default_factory=lambda: int(time.time() * 1000))
    status: str = "LIVE"  # WAITING, LIVE, PAUSED, STOPPED
    participants: List[ParticipantModel] = Field(default_factory=list)
    transcriptSegments: List[CaptionSegmentModel] = Field(default_factory=list)
    threads: List[ConversationThreadModel] = Field(default_factory=list)
    metrics: SessionMetricsModel = Field(default_factory=SessionMetricsModel)
    decisionLogs: List[DecisionLogModel] = Field(default_factory=list)
    activeEngine: str = "GEMINI_LIVE"

class MemoryStore:
    def __init__(self):
        self.sessions: Dict[str, SessionModel] = {}
        self.join_codes: Dict[str, str] = {}  # code -> sessionId

    def generate_join_code(self) -> str:
        chars = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ"  # readable alphanumeric without confusing 0/O, 1/I
        for _ in range(20):
            code = "".join(random.choices(chars, k=5))
            if code not in self.join_codes:
                return code
        return f"RT{random.randint(100, 999)}"

    def create_session(
        self,
        name: str,
        host_name: str,
        device_label: str = "Host Device",
        device_type: str = "laptop",
        custom_join_code: Optional[str] = None
    ) -> tuple[SessionModel, ParticipantModel]:
        session_id = f"ses-{int(time.time())}-{random.randint(1000, 9999)}"
        join_code = custom_join_code.upper().strip() if custom_join_code else self.generate_join_code()
        
        host_participant = ParticipantModel(
            participantId=f"p-{int(time.time())}-1",
            displayName=host_name,
            deviceId=f"dev-host-{random.randint(100, 999)}",
            deviceType=device_type,
            deviceLabel=device_label,
            isHost=True,
            isLocal=True,
            tableAngle=270,
            qualityScore=96,
        )

        session = SessionModel(
            sessionId=session_id,
            joinCode=join_code,
            name=name,
            participants=[host_participant],
            metrics=SessionMetricsModel(connectedDevices=1)
        )

        self.sessions[session_id] = session
        self.join_codes[join_code] = session_id
        return session, host_participant

    def get_session(self, session_id: str) -> Optional[SessionModel]:
        return self.sessions.get(session_id)

    def get_session_by_code(self, join_code: str) -> Optional[SessionModel]:
        session_id = self.join_codes.get(join_code.upper().strip())
        if session_id:
            return self.sessions.get(session_id)
        return None

    def join_session(
        self,
        session_id: str,
        display_name: str,
        device_label: str,
        device_type: str = "mobile",
        existing_participant_id: Optional[str] = None
    ) -> Optional[ParticipantModel]:
        session = self.get_session(session_id)
        if not session:
            return None

        # Check if reconnecting
        if existing_participant_id:
            for p in session.participants:
                if p.participantId == existing_participant_id:
                    p.connectionState = "CONNECTED"
                    p.lastSeenAt = int(time.time() * 1000)
                    session.metrics.connectedDevices = len([pt for pt in session.participants if pt.connectionState == "CONNECTED"])
                    return p

        # Check existing by device or name match
        for p in session.participants:
            if p.displayName.lower() == display_name.lower() and p.connectionState != "CONNECTED":
                p.connectionState = "CONNECTED"
                p.deviceLabel = device_label
                p.deviceType = device_type
                p.lastSeenAt = int(time.time() * 1000)
                session.metrics.connectedDevices = len([pt for pt in session.participants if pt.connectionState == "CONNECTED"])
                return p

        # Calculate circular table angle for neat visual layout
        total = len(session.participants)
        angle = (total * 60 + 30) % 360

        new_participant = ParticipantModel(
            participantId=f"p-{int(time.time())}-{random.randint(100, 999)}",
            displayName=display_name,
            deviceId=f"dev-{random.randint(1000, 9999)}",
            deviceType=device_type,
            deviceLabel=device_label,
            isHost=False,
            isLocal=False,
            tableAngle=angle,
            qualityScore=92,
        )

        session.participants.append(new_participant)
        session.metrics.connectedDevices = len([pt for pt in session.participants if pt.connectionState == "CONNECTED"])
        return new_participant

    def get_participant(self, session_id: str, participant_id: str) -> Optional[ParticipantModel]:
        session = self.get_session(session_id)
        if not session:
            return None
        for p in session.participants:
            if p.participantId == participant_id:
                return p
        return None

    def update_participant(
        self,
        session_id: str,
        participant_id: str,
        connection_state: Optional[str] = None,
        mic_state: Optional[str] = None,
        audio_level: Optional[int] = None,
        quality_score: Optional[int] = None
    ) -> Optional[ParticipantModel]:
        p = self.get_participant(session_id, participant_id)
        if not p:
            return None
        
        p.lastSeenAt = int(time.time() * 1000)
        if connection_state is not None:
            p.connectionState = connection_state
        if mic_state is not None:
            p.microphoneState = mic_state
        if audio_level is not None:
            p.audioLevel = audio_level
        if quality_score is not None:
            p.qualityScore = quality_score
        
        session = self.get_session(session_id)
        if session:
            session.metrics.connectedDevices = len([pt for pt in session.participants if pt.connectionState == "CONNECTED"])
        return p

    def add_segment(self, session_id: str, segment: CaptionSegmentModel):
        session = self.get_session(session_id)
        if not session:
            return
        session.transcriptSegments.append(segment)
        session.metrics.speechEvents += 1

    def update_segment(self, session_id: str, segment_id: str, **kwargs) -> Optional[CaptionSegmentModel]:
        session = self.get_session(session_id)
        if not session:
            return None
        for seg in session.transcriptSegments:
            if seg.segmentId == segment_id:
                for k, v in kwargs.items():
                    if hasattr(seg, k) and v is not None:
                        setattr(seg, k, v)
                seg.updatedAt = int(time.time() * 1000)
                return seg
        return None

    def add_decision_log(self, session_id: str, log_entry: DecisionLogModel):
        session = self.get_session(session_id)
        if session:
            session.decisionLogs.append(log_entry)
            # keep latest 60 logs
            if len(session.decisionLogs) > 60:
                session.decisionLogs.pop(0)

    def record_latency(self, session_id: str, latency_ms: int, asr_latency_ms: int = 0, fusion_latency_ms: int = 0):
        session = self.get_session(session_id)
        if not session:
            return
        m = session.metrics
        m.measuredLatencies.append(latency_ms)
        if len(m.measuredLatencies) > 200:
            m.measuredLatencies.pop(0)
        
        sorted_lat = sorted(m.measuredLatencies)
        m.medianLatencyMs = sorted_lat[len(sorted_lat) // 2]
        p95_idx = int(len(sorted_lat) * 0.95)
        m.p95LatencyMs = sorted_lat[min(p95_idx, len(sorted_lat) - 1)]
        if asr_latency_ms > 0:
            m.asrLatencyMs = asr_latency_ms
        if fusion_latency_ms > 0:
            m.fusionLatencyMs = fusion_latency_ms

    def pause_session(self, session_id: str) -> Optional[SessionModel]:
        session = self.get_session(session_id)
        if session:
            session.status = "PAUSED"
            return session
        return None

    def resume_session(self, session_id: str) -> Optional[SessionModel]:
        session = self.get_session(session_id)
        if session:
            session.status = "LIVE"
            return session
        return None

    def stop_session(self, session_id: str) -> Optional[SessionModel]:
        session = self.get_session(session_id)
        if session:
            session.status = "STOPPED"
            return session
        return None

    def update_threads(self, session_id: str, threads: List[ConversationThreadModel]):
        session = self.get_session(session_id)
        if session:
            session.threads = threads

store = MemoryStore()
