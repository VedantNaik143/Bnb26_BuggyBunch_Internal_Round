class ConfidenceEstimator:
    @staticmethod
    def estimate(
        text: str,
        quality_score: int,
        is_final: bool,
        duplicate_count: int = 1
    ) -> str:
        """
        Computes categorical confidence ('high', 'medium', 'low')
        based on acoustic quality, multi-device corroboration, and transcription stability.
        """
        if not text or len(text.strip()) < 3:
            return "low"

        score = 0
        if is_final:
            score += 40
        else:
            score += 20

        if quality_score >= 85:
            score += 35
        elif quality_score >= 65:
            score += 20
        else:
            score += 10

        if duplicate_count > 1:
            score += 25  # corroborated by multiple physical microphones

        if score >= 75:
            return "high"
        elif score >= 45:
            return "medium"
        return "low"
