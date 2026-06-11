from __future__ import annotations

import os
from dataclasses import dataclass


@dataclass(slots=True)
class Settings:
    austrac_api_url: str = os.getenv("AUSTRAC_API_URL", "https://api-sandbox.austrac.gov.au/v1")
    austrac_cert_secret_name: str = os.getenv("AUSTRAC_CERT_SECRET_NAME", "austrac/mtls-cert")
    secrets_manager_prefix: str = os.getenv("SECRETS_MANAGER_PREFIX", "aml-platform")
    llm_provider: str = os.getenv("LLM_PROVIDER", "local_llama")
    llm_api_url: str = os.getenv("LLM_API_URL", "http://localhost:11434/api/generate")
    azure_openai_endpoint: str = os.getenv("AZURE_OPENAI_ENDPOINT", "")
    azure_openai_deployment: str = os.getenv("AZURE_OPENAI_DEPLOYMENT", "")
    azure_openai_api_version: str = os.getenv("AZURE_OPENAI_API_VERSION", "2024-06-01")
    dedup_cache_ttl_seconds: int = int(os.getenv("DEDUP_CACHE_TTL_SECONDS", "3600"))
    sqs_dlq_url: str = os.getenv("SQS_DLQ_URL", "")
    sqs_region: str = os.getenv("SQS_REGION", "ap-southeast-2")
    max_transmit_retries: int = int(os.getenv("MAX_TRANSMIT_RETRIES", "3"))
    gateway_timeout_seconds: float = float(os.getenv("GATEWAY_TIMEOUT_SECONDS", "30.0"))
    redis_url: str = os.getenv("REDIS_URL", "redis://localhost:6379/0")
    aws_region: str = os.getenv("AWS_REGION", "ap-southeast-2")

    def __post_init__(self) -> None:
        if self.max_transmit_retries < 0:
            raise ValueError("max_transmit_retries must be non-negative")
        if self.gateway_timeout_seconds <= 0:
            raise ValueError("gateway_timeout_seconds must be positive")
        if self.dedup_cache_ttl_seconds < 0:
            raise ValueError("dedup_cache_ttl_seconds must be non-negative")


def get_settings() -> Settings:
    return Settings()
