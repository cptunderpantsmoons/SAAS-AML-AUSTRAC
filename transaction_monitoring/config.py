from __future__ import annotations

import os
from dataclasses import dataclass


@dataclass(slots=True)
class Settings:
    postgres_dsn: str = os.getenv("POSTGRES_DSN", "postgresql://localhost/aml")
    window_days: int = int(os.getenv("WINDOW_DAYS", "7"))
    analysis_interval: int = int(os.getenv("ANALYSIS_INTERVAL_SECONDS", "60"))
    retention_years: int = int(os.getenv("RETENTION_YEARS", "7"))
