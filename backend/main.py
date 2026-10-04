import asyncio
import json
import time
import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware

from backend.config import settings
from backend.storage.memory_store import store
from backend.realtime.connection import RealtimeConnection
from backend.realtime.manager import manager
from backend.realtime.heartbeat import heartbeat_monitor
from backend.speech.gemini_live import GeminiLiveSpeechProvider
from backend.fusion.engine import fusion_engine
from backend.audio.router import AudioRouter
from backend.routes.health import router as health_router
from backend.routes.sessions import router as sessions_router

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(name)s: %(message)s")
logger = logging.getLogger("roundtable_backend")

# Initialize shared components
speech_provider = GeminiLiveSpeechProvider()
audio_router = AudioRouter(speech_provider)

async def on_speech_event_received(
    session_id: str,
    participant_id: str,
    text: str,
    is_final: bool,
    start_ms: int,
    end_ms: int,
    asr_latency_ms: int
):
    """
    Called whenever raw speech is recognized from any device.
    Routes to the multi-device fusion engine.
    """
    session = store.get_session(session_id)
    if not session or session.status == "PAUSED":
        # Do not process speech or create captions while session is paused
        return

    segment, event_type, extra = fusion_engine.process_speech_event(
        session_id=session_id,
        participant_id=participant_id,
        text=text,
        is_final=is_final,
        start_ms=start_ms,
        end_ms=end_ms,
        asr_latency_ms=asr_latency_ms
    )

    if segment and event_type != "NOOP":
        metrics_dump = session.metrics.model_dump() if session else {}
        
        # Broadcast the unified caption event to all connected devices in the room
        await manager.broadcast_to_session(
            session_id=session_id,
            event_type=event_type,
            data={
                "segment": segment.model_dump(),
                "metrics": metrics_dump
            }
        )

        # Broadcast overlap event if detected
        if extra and extra.get("overlapDetected"):
            await manager.broadcast_to_session(
                session_id=session_id,
                event_type="OVERLAP_DETECTED",
                data={
                    "groupId": extra.get("groupId"),
                    "speakerId": participant_id,
                    "metrics": metrics_dump
                }
            )

        # Broadcast conversation threads
        if extra and extra.get("threads"):
            await manager.broadcast_to_session(
                session_id=session_id,
                event_type="CONVERSATION_THREADS_UPDATED",
                data={
                    "threads": extra.get("threads")
                }
            )

            # Trigger background rolling summary generation for side discussions
            asyncio.create_task(_async_update_summaries(session_id))

async def _async_update_summaries(session_id: str):
    session = store.get_session(session_id)
    if not session or not session.threads:
        return
    from backend.fusion.summarizer import rolling_summarizer
    updated = await rolling_summarizer.maybe_summarize_threads(session.threads)
    if updated:
        await manager.broadcast_to_session(
            session_id=session_id,
            event_type="CONVERSATION_THREADS_UPDATED",
            data={
                "threads": [t.model_dump() for t in session.threads]
            }
        )

@asynccontextmanager
async def lifespan(app: FastAPI):
    configured_str = "YES" if bool(settings.GEMINI_API_KEY) else "NO"
    print(f"Gemini configured: {configured_str}")
    print(f"Gemini model: {settings.GEMINI_MODEL}")
    print(f"Backend address: {settings.HOST}:{settings.PORT}")
    logger.info(f"Gemini configured: {configured_str}")
    logger.info(f"Gemini model: {settings.GEMINI_MODEL}")
    logger.info(f"Backend address: {settings.HOST}:{settings.PORT}")
    heartbeat_monitor.start()
    yield
    logger.info("Shutting down Roundtable Backend...")
    heartbeat_monitor.stop()

app = FastAPI(
    title="Roundtable Acoustic Fusion Backend",
    description="Multi-device acoustic mesh, realtime audio transport, Gemini Live transcription, and practical fusion.",
    version="1.0.0",
    lifespan=lifespan
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(health_router)
app.include_router(sessions_router)

@app.websocket("/ws/sessions/{session_id}/{participant_id}")
async def websocket_session_endpoint(websocket: WebSocket, session_id: str, participant_id: str):
    await websocket.accept()

    session = store.get_session(session_id)
    if not session:
        # Check by join code
        session = store.get_session_by_code(session_id)
        if session:
            session_id = session.sessionId

    if not session:
        await websocket.close(code=4004, reason="Session not found")
        return

    # Update or restore participant
    existing_participant = store.get_participant(session_id, participant_id)
    is_new = existing_participant is None

    if is_new:
        participant = store.join_session(
            session_id=session_id,
            display_name=f"Guest ({participant_id[-4:]})",
            device_label="Mobile Microphone",
            existing_participant_id=participant_id
        )
    else:
        participant = existing_participant

    store.update_participant(session_id, participant_id, connection_state="CONNECTED")
    conn = RealtimeConnection(websocket, session_id, participant_id)
    manager.register(conn)

    # 1. Immediately send initial full state sync to connecting device
    await conn.send_event(
        "SESSION_SYNC",
        {
            "session": session.model_dump(),
            "participantId": participant_id
        }
    )

    # 2. Inform room of connection with correct event type
    event_type = "PARTICIPANT_JOINED" if is_new else "PARTICIPANT_RECONNECTED"
    await manager.broadcast_to_session(
        session_id,
        event_type,
        {
            "participant": participant.model_dump() if participant else {"participantId": participant_id},
            "connectedDevices": session.metrics.connectedDevices
        },
        exclude_participant_id=participant_id
    )

    # 3. Open streaming speech session for this participant asynchronously in background
    asyncio.create_task(
        speech_provider.open_session(
            session_id=session_id,
            participant_id=participant_id,
            on_speech_event=on_speech_event_received
        )
    )

    last_level_broadcast = 0.0

    try:
        while True:
            message = await websocket.receive()
            conn.touch()

            if message.get("type") == "websocket.disconnect":
                break

            # Binary frame: 16kHz mono PCM16 audio
            if "bytes" in message and message["bytes"]:
                cur_session = store.get_session(session_id)
                if cur_session and cur_session.status == "PAUSED":
                    # Drop audio frames when session is paused
                    continue

                pcm_bytes = message["bytes"]
                now_ms = int(time.time() * 1000)
                level, score, tier = await audio_router.handle_pcm_chunk(
                    session_id=session_id,
                    participant_id=participant_id,
                    pcm_bytes=pcm_bytes,
                    start_ms=now_ms - settings.CHUNK_DURATION_MS,
                    end_ms=now_ms
                )

                # Broadcast live audio level throttle (~100ms) for UI table animation
                cur_t = time.time()
                if (cur_t - last_level_broadcast) > 0.10:
                    last_level_broadcast = cur_t
                    await manager.broadcast_to_session(
                        session_id,
                        "DEVICE_QUALITY_CHANGED",
                        {
                            "participantId": participant_id,
                            "audioLevel": level,
                            "qualityScore": score,
                            "qualityTier": tier
                        }
                    )

            # Text frame: JSON control messages
            elif "text" in message and message["text"]:
                try:
                    data = json.loads(message["text"])
                    evt_type = data.get("type", "")

                    if evt_type == "PING":
                        await conn.send_event("PONG", {"timestamp": time.time()})

                    elif evt_type == "MIC_STARTED":
                        store.update_participant(session_id, participant_id, mic_state="ACTIVE")
                        await manager.broadcast_to_session(
                            session_id,
                            "MIC_STARTED",
                            {"participantId": participant_id}
                        )

                    elif evt_type == "MIC_STOPPED":
                        store.update_participant(session_id, participant_id, mic_state="MUTED", audio_level=0)
                        await manager.broadcast_to_session(
                            session_id,
                            "MIC_STOPPED",
                            {"participantId": participant_id}
                        )

                    elif evt_type == "SESSION_PAUSED":
                        store.pause_session(session_id)
                        await manager.broadcast_to_session(
                            session_id,
                            "SESSION_PAUSED",
                            {"sessionId": session_id}
                        )

                    elif evt_type == "SESSION_RESUMED":
                        store.resume_session(session_id)
                        await manager.broadcast_to_session(
                            session_id,
                            "SESSION_RESUMED",
                            {"sessionId": session_id}
                        )

                    elif evt_type == "SPEECH_CHUNK":
                        speech_text = str(data.get("text", "")).strip()
                        is_final = bool(data.get("isFinal", False))
                        if speech_text:
                            now_ms = int(time.time() * 1000)
                            await on_speech_event_received(
                                session_id=session_id,
                                participant_id=participant_id,
                                text=speech_text,
                                is_final=is_final,
                                start_ms=now_ms - 1500,
                                end_ms=now_ms,
                                asr_latency_ms=110
                            )

                    elif evt_type == "SESSION_STOPPED":
                        store.stop_session(session_id)
                        await manager.broadcast_to_session(
                            session_id,
                            "SESSION_STOPPED",
                            {"sessionId": session_id}
                        )

                except Exception as e:
                    logger.warning(f"Error parsing text message from {participant_id}: {e}")

    except WebSocketDisconnect:
        logger.info(f"WebSocket disconnected for {participant_id}")
    except Exception as e:
        logger.error(f"WebSocket error for {participant_id}: {e}")
    finally:
        manager.deregister(conn)
        store.update_participant(session_id, participant_id, connection_state="TEMPORARILY_LOST", audio_level=0)
        await speech_provider.close_session(session_id, participant_id)

        # Broadcast participant temporarily lost (awaiting reconnect)
        await manager.broadcast_to_session(
            session_id,
            "PARTICIPANT_LEFT",
            {
                "participantId": participant_id,
                "connectionState": "TEMPORARILY_LOST",
                "connectedDevices": session.metrics.connectedDevices
            }
        )
