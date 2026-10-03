import time
import logging
from typing import Any, Dict
from fastapi import WebSocket

logger = logging.getLogger("connection")

class RealtimeConnection:
    def __init__(self, websocket: WebSocket, session_id: str, participant_id: str):
        self.websocket = websocket
        self.session_id = session_id
        self.participant_id = participant_id
        self.connected_at = time.time()
        self.last_seen = time.time()
        self.is_alive = True

    async def send_event(self, event_type: str, data: Dict[str, Any]):
        if not self.is_alive:
            return
        payload = {
            "id": f"evt-{int(time.time() * 1000)}",
            "type": event_type,
            "timestampMs": int(time.time() * 1000),
            "data": data
        }
        try:
            await self.websocket.send_json(payload)
        except Exception as e:
            logger.debug(f"Failed to send to {self.participant_id}: {e}")
            self.is_alive = False

    def touch(self):
        self.last_seen = time.time()
