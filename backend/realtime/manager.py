import logging
from typing import Dict, List, Optional, Any
from backend.storage.memory_store import store
from backend.realtime.connection import RealtimeConnection

logger = logging.getLogger("realtime_manager")

class RealtimeManager:
    def __init__(self):
        # Maps session_id -> list of RealtimeConnection
        self.rooms: Dict[str, List[RealtimeConnection]] = {}

    def register(self, connection: RealtimeConnection):
        session_id = connection.session_id
        if session_id not in self.rooms:
            self.rooms[session_id] = []
        
        # Remove any stale connection for the same participant
        self.rooms[session_id] = [
            c for c in self.rooms[session_id]
            if c.participant_id != connection.participant_id
        ]
        self.rooms[session_id].append(connection)
        logger.info(f"Registered connection for participant {connection.participant_id} in session {session_id}")

    def deregister(self, connection: RealtimeConnection):
        session_id = connection.session_id
        if session_id in self.rooms:
            self.rooms[session_id] = [
                c for c in self.rooms[session_id]
                if c.participant_id != connection.participant_id
            ]
            if not self.rooms[session_id]:
                del self.rooms[session_id]
        logger.info(f"Deregistered participant {connection.participant_id} from session {session_id}")

    async def broadcast_to_session(
        self,
        session_id: str,
        event_type: str,
        data: Dict[str, Any],
        exclude_participant_id: Optional[str] = None
    ):
        connections = self.rooms.get(session_id, [])
        for conn in list(connections):
            if exclude_participant_id and conn.participant_id == exclude_participant_id:
                continue
            if conn.is_alive:
                try:
                    await conn.send_event(event_type, data)
                except Exception as e:
                    logger.debug(f"Broadcast error to {conn.participant_id}: {e}")
                    conn.is_alive = False

    async def send_to_participant(
        self,
        session_id: str,
        participant_id: str,
        event_type: str,
        data: Dict[str, Any]
    ):
        connections = self.rooms.get(session_id, [])
        for conn in connections:
            if conn.participant_id == participant_id and conn.is_alive:
                await conn.send_event(event_type, data)
                break

manager = RealtimeManager()
