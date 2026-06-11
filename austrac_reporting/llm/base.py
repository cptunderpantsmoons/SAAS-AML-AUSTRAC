from __future__ import annotations

from abc import ABC, abstractmethod

from austrac_reporting.models import NarrativeDraft, ReportPayload


class LLMError(Exception):
    """Raised when LLM interaction fails."""


class BaseLLMAdapter(ABC):
    """Abstract adapter for LLM narrative generation."""

    def __init__(self, model_name: str) -> None:
        self._model_name = model_name

    @abstractmethod
    async def draft_narrative(self, payload: ReportPayload, system_prompt: str) -> NarrativeDraft:
        """Generate a narrative draft for the given payload."""

    def _make_draft(self, raw_text: str, confidence: float = 0.0) -> NarrativeDraft:
        return NarrativeDraft(
            draft_text=raw_text.strip(),
            requires_human_approval=True,
            confidence_score=confidence,
            model_used=self._model_name,
        )
