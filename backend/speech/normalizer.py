import re

class SpeechNormalizer:
    @staticmethod
    def normalize_text(text: str) -> str:
        if not text:
            return ""
        
        cleaned = text.strip()
        # Remove markdown bold/italics
        cleaned = re.sub(r"\*+", "", cleaned)
        # Collapse multiple spaces
        cleaned = re.sub(r"\s+", " ", cleaned)
        # Remove speaker prefixes if hallucinated by model e.g. "Speaker 1:"
        cleaned = re.sub(r"^(Speaker\s*\d*|Host|User|Participant\s*\d*):\s*", "", cleaned, flags=re.IGNORECASE)
        return cleaned.strip()

    @staticmethod
    def word_similarity(text_a: str, text_b: str) -> float:
        """
        Computes Jaccard word set similarity between two text strings.
        """
        words_a = set(re.findall(r"\b\w+\b", text_a.lower()))
        words_b = set(re.findall(r"\b\w+\b", text_b.lower()))

        if not words_a or not words_b:
            return 0.0

        intersection = words_a.intersection(words_b)
        union = words_a.union(words_b)
        return len(intersection) / len(union)
