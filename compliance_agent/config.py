from __future__ import annotations

import os
from dataclasses import dataclass


@dataclass(slots=True)
class Settings:
    agentmail_api_key: str = os.getenv("AGENTMAIL_API_KEY", "")
    agent_model: str = os.getenv("AGENT_MODEL", "anthropic:claude-sonnet-4-6")
    gateway_url: str = os.getenv("GATEWAY_URL", "http://localhost:8000")
    agent_timeout_seconds: float = float(os.getenv("AGENT_TIMEOUT_SECONDS", "30.0"))

    def __post_init__(self) -> None:
        if self.agent_timeout_seconds <= 0:
            raise ValueError("agent_timeout_seconds must be positive")
        if not self.gateway_url:
            raise ValueError("gateway_url must not be empty")


def get_settings() -> Settings:
    return Settings()
