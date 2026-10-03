import struct
import math
from typing import Tuple

class AudioQualityAnalyzer:
    """
    Lightweight, honest audio signal analyzer operating directly on PCM16 samples.
    Measures genuine RMS, peak level, and clipping percentage.
    """

    @staticmethod
    def analyze_pcm16(pcm_data: bytes) -> Tuple[float, int, str, int]:
        """
        Analyzes raw 16-bit PCM mono bytes.
        Returns:
            (rms_amplitude, level_0_to_100, quality_tier, quality_score)
        """
        if not pcm_data or len(pcm_data) < 2:
            return 0.0, 0, "OFFLINE", 0

        num_samples = len(pcm_data) // 2
        # Unpack as signed 16-bit integers
        try:
            samples = struct.unpack(f"<{num_samples}h", pcm_data[: num_samples * 2])
        except Exception:
            return 0.0, 0, "POOR", 30

        if not samples:
            return 0.0, 0, "OFFLINE", 0

        sum_squares = 0.0
        peak = 0
        clipping_count = 0

        for s in samples:
            abs_s = abs(s)
            if abs_s > peak:
                peak = abs_s
            sum_squares += s * s
            if abs_s >= 32700:
                clipping_count += 1

        mean_square = sum_squares / num_samples
        rms = math.sqrt(mean_square)
        clipping_ratio = clipping_count / num_samples

        # Level mapping 0 to 100 for visual meters (RMS / ~8000 scaled)
        normalized_level = min(100, int((rms / 6000.0) * 100))

        # Honest Quality Tier & Score
        # Max PCM16 value is 32767
        if clipping_ratio > 0.10:
            tier = "POOR"  # heavily clipped
            score = 45
        elif rms < 50:
            tier = "FAIR"  # near silence / background ambient
            score = 65
        elif rms < 300:
            tier = "FAIR"  # quiet speech
            score = 80
        elif rms <= 22000:
            tier = "GOOD"  # healthy clear speech
            score = 96
        else:
            tier = "FAIR"  # very loud / approaching limit
            score = 75

        return rms, normalized_level, tier, score
