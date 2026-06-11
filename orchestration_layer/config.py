from __future__ import annotations

import os
from dataclasses import dataclass
from typing import Final

DEFAULT_DETECTION_ENGINE_URL: Final = "http://localhost:8000"


@dataclass(slots=True)
class Settings:
    # ── Orchestration ──────────────────────────────────────────────
    aws_region: str = os.getenv("AWS_REGION", "ap-southeast-2")
    detection_engine_url: str = os.getenv("DETECTION_ENGINE_URL", DEFAULT_DETECTION_ENGINE_URL)
    ubo_service_url: str = os.getenv("UBO_SERVICE_URL", "http://localhost:8002")

    # ── Secrets Manager ────────────────────────────────────────────
    secrets_manager_prefix: str = os.getenv("SECRETS_MANAGER_PREFIX", "aml-au/orchestration")

    # ── Circuit Breaker ────────────────────────────────────────────
    circuit_failure_threshold: int = int(os.getenv("CIRCUIT_FAILURE_THRESHOLD", "5"))
    circuit_recovery_timeout_seconds: int = int(os.getenv("CIRCUIT_RECOVERY_TIMEOUT_SECONDS", "30"))
    circuit_half_open_max_calls: int = int(os.getenv("CIRCUIT_HALF_OPEN_MAX_CALLS", "3"))

    # ── Exponential Backoff ────────────────────────────────────────
    backoff_base_seconds: float = float(os.getenv("BACKOFF_BASE_SECONDS", "1.0"))
    backoff_max_seconds: float = float(os.getenv("BACKOFF_MAX_SECONDS", "60.0"))
    backoff_max_retries: int = int(os.getenv("BACKOFF_MAX_RETRIES", "3"))

    # ── Adapter Provider Selection ─────────────────────────────────
    kyc_provider: str = os.getenv("KYC_PROVIDER", "veriff")
    sanctions_provider: str = os.getenv("SANCTIONS_PROVIDER", "open_sanctions")
    kyb_provider: str = os.getenv("KYB_PROVIDER", "kyckr")

    # ── Risk Score Aggregation ─────────────────────────────────────
    risk_score_kyc_weight: float = float(os.getenv("RISK_SCORE_KYC_WEIGHT", "0.35"))
    risk_score_sanctions_weight: float = float(os.getenv("RISK_SCORE_SANCTIONS_WEIGHT", "0.30"))
    risk_score_document_weight: float = float(os.getenv("RISK_SCORE_DOCUMENT_WEIGHT", "0.20"))
    risk_score_ubo_weight: float = float(os.getenv("RISK_SCORE_UBO_WEIGHT", "0.15"))

    # ── Alerting Thresholds ────────────────────────────────────────────
    alert_error_rate_threshold: float = float(os.getenv("ALERT_ERROR_RATE_THRESHOLD", "0.1"))
    alert_latency_threshold_ms: int = int(os.getenv("ALERT_LATENCY_THRESHOLD_MS", "5000"))

    # ── CloudWatch Logs ─────────────────────────────────────────────────
    cloudwatch_log_group: str = os.getenv("CLOUDWATCH_LOG_GROUP", "/aml-au/orchestration")

    # ── Splunk HEC ──────────────────────────────────────────────────────
    splunk_hec_url: str = os.getenv("SPLUNK_HEC_URL", "")
    splunk_hec_token: str = os.getenv("SPLUNK_HEC_TOKEN", "")
    splunk_index: str = os.getenv("SPLUNK_INDEX", "main")
    splunk_source: str = os.getenv("SPLUNK_SOURCE", "aml-au:orchestration")

    # ── Allowed providers ──────────────────────────────────────────
    allowed_kyc_providers: tuple[str, ...] = ("veriff", "idenfy", "au10tix")
    allowed_sanctions_providers: tuple[str, ...] = ("open_sanctions", "complyadvantage")
    allowed_kyb_providers: tuple[str, ...] = ("kyckr", "creditsafe")

    def __post_init__(self) -> None:
        if self.kyc_provider not in self.allowed_kyc_providers:
            raise ValueError(f"Unknown KYC provider: {self.kyc_provider}")
        if self.sanctions_provider not in self.allowed_sanctions_providers:
            raise ValueError(f"Unknown sanctions provider: {self.sanctions_provider}")
        if self.kyb_provider not in self.allowed_kyb_providers:
            raise ValueError(f"Unknown KYB provider: {self.kyb_provider}")
        weights = (self.risk_score_kyc_weight + self.risk_score_sanctions_weight
                   + self.risk_score_document_weight + self.risk_score_ubo_weight)
        if not (0.99 <= weights <= 1.01):
            raise ValueError(f"Risk score weights must sum to 1.0, got {weights:.2f}")


def get_settings() -> Settings:
    return Settings()
