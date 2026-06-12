"""SuperTokens authentication module for AML/CTF platform.

Provides centralized initialization, configuration, and FastAPI dependencies
for session verification and role-based access control using a self-hosted
SuperTokens core instance.
"""
from __future__ import annotations

import logging
import os
from dataclasses import dataclass, field
from typing import Final

logger = logging.getLogger("auth.config")

DEFAULT_SUPERTOKENS_CORE: Final = "https://srv1603169.hstgr.cloud"
DEFAULT_API_BASE_PATH: Final = "/auth"


@dataclass(slots=True)
class AuthSettings:
    """Configuration for SuperTokens integration."""

    # ── SuperTokens Core ──────────────────────────────────────────────
    connection_uri: str = field(
        default_factory=lambda: os.getenv("SUPERTOKENS_CONNECTION_URI", DEFAULT_SUPERTOKENS_CORE)
    )
    api_key: str = field(
        default_factory=lambda: os.getenv("SUPERTOKENS_API_KEY", "")
    )
    app_name: str = field(
        default_factory=lambda: os.getenv("SUPERTOKENS_APP_NAME", "AML-CTF-Platform")
    )
    api_domain: str = field(
        default_factory=lambda: os.getenv("SUPERTOKENS_API_DOMAIN", "http://localhost:8000")
    )
    website_domain: str = field(
        default_factory=lambda: os.getenv("SUPERTOKENS_WEBSITE_DOMAIN", "http://localhost:3000")
    )
    api_base_path: str = field(
        default_factory=lambda: os.getenv("SUPERTOKENS_API_BASE_PATH", DEFAULT_API_BASE_PATH)
    )
    website_base_path: str = field(
        default_factory=lambda: os.getenv("SUPERTOKENS_WEBSITE_BASE_PATH", "/")
    )

    # ── Session ───────────────────────────────────────────────────────
    cookie_secure: bool = field(
        default_factory=lambda: os.getenv("SUPERTOKENS_COOKIE_SECURE", "false").lower() == "true"
    )
    cookie_same_site: str = field(
        default_factory=lambda: os.getenv("SUPERTOKENS_COOKIE_SAME_SITE", "lax")
    )
    enable_middleware: bool = field(
        default_factory=lambda: os.getenv("SUPERTOKENS_ENABLE_MIDDLEWARE", "true").lower() == "true"
    )

    # ── Authorization ─────────────────────────────────────────────────
    # Comma-separated list of roles that map to "compliance_officer"
    compliance_roles: tuple[str, ...] = field(
        default_factory=lambda: tuple(
            r.strip()
            for r in os.getenv("COMPLIANCE_ROLES", "compliance_officer").split(",")
            if r.strip()
        )
    )
    # Comma-separated list of roles that map to "board_member"
    board_roles: tuple[str, ...] = field(
        default_factory=lambda: tuple(
            r.strip()
            for r in os.getenv("BOARD_ROLES", "board_member").split(",")
            if r.strip()
        )
    )

    def __post_init__(self) -> None:
        pass


def get_auth_settings() -> AuthSettings:
    return AuthSettings()
