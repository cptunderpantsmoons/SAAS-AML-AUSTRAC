from __future__ import annotations

from austrac_reporting.config import Settings
from austrac_reporting.llm.azure_openai import AzureOpenAIAdapter
from austrac_reporting.llm.base import BaseLLMAdapter
from austrac_reporting.llm.local_llama import LocalLlama3Adapter


def create_llm_adapter(settings: Settings) -> BaseLLMAdapter:
    if settings.llm_provider == "azure_openai":
        return AzureOpenAIAdapter(
            endpoint=settings.azure_openai_endpoint,
            deployment=settings.azure_openai_deployment,
            api_version=settings.azure_openai_api_version,
        )
    return LocalLlama3Adapter(api_url=settings.llm_api_url)
