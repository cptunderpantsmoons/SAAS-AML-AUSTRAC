from __future__ import annotations

import os
from dataclasses import dataclass, field
from typing import Final

DEFAULT_ALLOWED_CONTENT_TYPES: Final[tuple[str, ...]] = (
    "application/pdf",
    "text/plain",
    "text/html",
    "image/png",
    "image/jpeg",
)


@dataclass(slots=True)
class Settings:
    max_upload_bytes: int = int(os.getenv("MAX_UPLOAD_BYTES", str(10 * 1024 * 1024)))
    visual_forgery_threshold: float = float(os.getenv("VISUAL_FORGERY_THRESHOLD", "0.75"))
    prompt_injection_threshold: float = float(os.getenv("PROMPT_INJECTION_THRESHOLD", "0.7"))
    whitespace_threshold: float = float(os.getenv("WHITESPACE_STEG_THRESHOLD", "0.65"))
    storage_backend: str = os.getenv("STORAGE_BACKEND", "local")
    storage_bucket: str = os.getenv("STORAGE_BUCKET", "aml-au-documents-sanitized")
    storage_prefix: str = os.getenv("STORAGE_PREFIX", "sanitized")
    kms_key_id: str = os.getenv("KMS_KEY_ID", "alias/aml-au-documents")
    aws_region: str = os.getenv("AWS_REGION", "ap-southeast-2")
    presign_ttl_seconds: int = int(os.getenv("PRESIGN_TTL_SECONDS", "900"))
    local_storage_dir: str = os.getenv("LOCAL_STORAGE_DIR", "/tmp/document-detection-engine")
    blocked_extensions: set[str] = field(
        default_factory=lambda: {".exe", ".dll", ".bat", ".cmd", ".js", ".jar", ".ps1", ".sh"}
    )
    allowed_content_types: tuple[str, ...] = DEFAULT_ALLOWED_CONTENT_TYPES


def get_settings() -> Settings:
    return Settings()
