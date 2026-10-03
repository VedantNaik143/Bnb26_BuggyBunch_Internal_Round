import time

class TimestampManager:
    """
    Manages session-relative monotonic timestamps for audio chunks and caption events.
    """

    @staticmethod
    def now_ms() -> int:
        return int(time.time() * 1000)

    @staticmethod
    def session_elapsed_ms(session_start_time_ms: int) -> int:
        elapsed = int(time.time() * 1000) - session_start_time_ms
        return max(0, elapsed)
