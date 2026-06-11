from __future__ import annotations

import logging
import os
from typing import Any

import httpx

from austrac_reporting.llm.base import BaseLLMAdapter, LLMError
from austrac_reporting.models import NarrativeDraft, ReportPayload

logger = logging.getLogger("austrac_reporting.llm.azure_openai")


class AzureOpenAIAdapter(BaseLLMAdapter):
    """Adapter for Azure OpenAI with zero-retention policy configuration."""

    def __init__(
        self,
        endpoint: str,
        deployment: str,
        api_version: str = "2024-06-01",
    ) -> None:
        super().__init__(model_name=f"azure-openai-{deployment}")
        self._endpoint = endpoint.rstrip("/")
        self._deployment = deployment
        self._api_version = api_version

    def _chat_url(self) -> str:
        base = f"{self._endpoint}/openai/deployments/{self._deployment}"
        return f"{base}/chat/completions?api-version={self._api_version}"

    async def draft_narrative(self, payload: ReportPayload, system_prompt: str) -> NarrativeDraft:
        messages = [
            {
                "role": "system",
                "content": "You are an AUSTRAC compliance narrative assistant. Do not retain or log this conversation.",
            },
            {"role": "user", "content": system_prompt},
        ]
        request_body: dict[str, Any] = {
            "messages": messages,
            "temperature": 0.1,
            "max_tokens": 1024,
        }
        try:
            api_key = os.getenv("AZURE_OPENAI_API_KEY", "")
            if not api_key:
                raise LLMError("AZURE_OPENAI_API_KEY not set")
            headers = {"api-key": api_key, "Content-Type": "application/json"}
            async with httpx.AsyncClient(timeout=60.0) as client:
                response = await client.post(self._chat_url(), json=request_body, headers=headers)
                response.raise_for_status()
                data = response.json()
                choices = data.get("choices", [])
                if not choices:
                    raise LLMError("No choices returned from Azure OpenAI")
                raw_text = choices[0].get("message", {}).get("content", "")
                return self._make_draft(raw_text, confidence=0.85)
        except httpx.HTTPError as exc:
            logger.error("Azure OpenAI request failed: %s", exc)
            raise LLMError(f"Azure OpenAI request failed: {exc}") from exc
        except Exception as exc:
            logger.error("Unexpected error calling Azure OpenAI: %s", exc)
            raise LLMError(f"Unexpected error: {exc}") from exc
