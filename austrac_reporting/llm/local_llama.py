from __future__ import annotations

import logging
from typing import Any

import httpx

from austrac_reporting.llm.base import BaseLLMAdapter, LLMError
from austrac_reporting.models import NarrativeDraft, ReportPayload

logger = logging.getLogger("austrac_reporting.llm.local_llama")


class LocalLlama3Adapter(BaseLLMAdapter):
    """Adapter for locally-hosted Llama 3 via Ollama-compatible HTTP API."""

    def __init__(self, api_url: str = "http://localhost:11434/api/generate", model: str = "llama3") -> None:
        super().__init__(model_name=model)
        self._api_url = api_url

    async def draft_narrative(self, payload: ReportPayload, system_prompt: str) -> NarrativeDraft:
        request_body: dict[str, Any] = {
            "model": self._model_name,
            "prompt": system_prompt,
            "stream": False,
            "options": {"temperature": 0.1, "num_predict": 1024},
        }
        try:
            async with httpx.AsyncClient(timeout=60.0) as client:
                response = await client.post(self._api_url, json=request_body)
                response.raise_for_status()
                data = response.json()
                raw_text = data.get("response", "")
                return self._make_draft(raw_text, confidence=0.75)
        except httpx.HTTPError as exc:
            logger.error("Llama API request failed: %s", exc)
            raise LLMError(f"Llama API request failed: {exc}") from exc
        except Exception as exc:
            logger.error("Unexpected error calling Llama API: %s", exc)
            raise LLMError(f"Unexpected error: {exc}") from exc
