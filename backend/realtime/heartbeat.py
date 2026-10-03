import time
import asyncio
import logging
from backend.config import settings
from backend.storage.memory_store import store
from backend.realtime.manager import manager

logger = logging.getLogger("heartbeat")

class HeartbeatMonitor:
    def __init__(self):
        self._running = False
        self._task = None

    def start(self):
        if not self._running:
            self._running = True
            self._task = asyncio.create_task(self._loop())

    def stop(self):
        self._running = False
        if self._task:
            self._task.cancel()

    async def _loop(self):
        while self._running:
            try:
                await asyncio.sleep(settings.HEARTBEAT_INTERVAL_SEC)
                now = time.time()
                timeout = settings.HEARTBEAT_TIMEOUT_SEC

                for session_id, connections in list(manager.rooms.items()):
                    for conn in list(connections):
                        if (now - conn.last_seen) > timeout and conn.is_alive:
                            logger.info(f"Participant {conn.participant_id} timed out. Marking TEMPORARILY_LOST")
                            p = store.update_participant(session_id, conn.participant_id, connection_state="TEMPORARILY_LOST")
                            if p:
                                await manager.broadcast_to_session(
                                    session_id,
                                    "PARTICIPANT_LEFT",
                                    {"participantId": conn.participant_id, "connectionState": "TEMPORARILY_LOST"}
                                )
            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.error(f"Error in heartbeat loop: {e}")

heartbeat_monitor = HeartbeatMonitor()
