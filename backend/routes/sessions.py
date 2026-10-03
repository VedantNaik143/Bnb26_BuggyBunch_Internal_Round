from typing import Optional, List
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from backend.storage.memory_store import store
from backend.realtime.manager import manager

router = APIRouter(prefix="/api/sessions", tags=["Sessions"])

class CreateSessionRequest(BaseModel):
    name: str
    hostName: str
    deviceLabel: str = "Host Microphone"
    deviceType: str = "laptop"
    customJoinCode: Optional[str] = None

class JoinSessionRequest(BaseModel):
    displayName: str
    deviceLabel: str = "Guest Microphone"
    deviceType: str = "mobile"
    participantId: Optional[str] = None

@router.post("")
async def create_session(payload: CreateSessionRequest):
    session, host_participant = store.create_session(
        name=payload.name,
        host_name=payload.hostName,
        device_label=payload.deviceLabel,
        device_type=payload.deviceType,
        custom_join_code=payload.customJoinCode
    )
    return {
        "session": session.model_dump(),
        "participant": host_participant.model_dump()
    }

@router.get("/{session_id_or_code}")
async def get_session(session_id_or_code: str):
    # Try finding by session ID
    session = store.get_session(session_id_or_code)
    # If not found, try finding by join code
    if not session:
        session = store.get_session_by_code(session_id_or_code)
    
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    
    return {"session": session.model_dump()}

@router.post("/{session_id_or_code}/join")
async def join_session(session_id_or_code: str, payload: JoinSessionRequest):
    session = store.get_session(session_id_or_code)
    if not session:
        session = store.get_session_by_code(session_id_or_code)
    
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    is_reconnect = bool(payload.participantId)
    participant = store.join_session(
        session_id=session.sessionId,
        display_name=payload.displayName,
        device_label=payload.deviceLabel,
        device_type=payload.deviceType,
        existing_participant_id=payload.participantId
    )

    if not participant:
        raise HTTPException(status_code=400, detail="Failed to join session")

    # Broadcast event to other participants in the room
    event_type = "PARTICIPANT_RECONNECTED" if is_reconnect else "PARTICIPANT_JOINED"
    await manager.broadcast_to_session(
        session.sessionId,
        event_type,
        {
            "participant": participant.model_dump(),
            "connectedDevices": session.metrics.connectedDevices
        },
        exclude_participant_id=participant.participantId
    )

    return {
        "session": session.model_dump(),
        "participant": participant.model_dump()
    }

@router.post("/{session_id}/start")
async def start_session(session_id: str):
    session = store.get_session(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    session.status = "LIVE"
    await manager.broadcast_to_session(session_id, "SESSION_STARTED", {"sessionId": session_id})
    return {"session": session.model_dump()}

@router.post("/{session_id}/stop")
async def stop_session(session_id: str):
    session = store.get_session(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    session.status = "STOPPED"
    await manager.broadcast_to_session(session_id, "SESSION_STOPPED", {"sessionId": session_id})
    return {"session": session.model_dump()}

@router.get("/{session_id}/evaluation")
async def get_evaluation_data(session_id: str):
    session = store.get_session(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    
    m = session.metrics
    return {
        "sessionId": session.sessionId,
        "sessionName": session.name,
        "isLiveMode": True,
        "metrics": m.model_dump(),
        "decisionLogs": [d.model_dump() for d in session.decisionLogs],
        "methodology": {
            "mode": "Roundtable Acoustic Fusion Mesh",
            "participantsMeasured": len(session.participants),
            "totalSpeechEvents": m.speechEvents,
            "deduplicationCount": m.deduplicatedEvents,
            "overlapCount": m.overlapCount,
            "measuredMedianLatencyMs": m.medianLatencyMs or "Not measured",
            "measuredP95LatencyMs": m.p95LatencyMs or "Not measured"
        }
    }
