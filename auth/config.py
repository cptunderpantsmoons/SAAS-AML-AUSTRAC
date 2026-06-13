"""SuperTokens authentication module for AML/CTF platform.

Provides centralized initialization, configuration, and FastAPI dependencies
for session verification and role-based access control using a self-hosted
SuperTokens core instance.
"""
from __future__ import annotations

import logging
import os
from dataclasses import dataclass, field

logger = logging.getLogger("auth.config")

# NOTE: There is intentionally no default ``SUPERTOKENS_CONNECTION_URI``.  If
# the environment variable is not set, the AuthSettings constructor raises a
# clear ``RuntimeError`` so a misconfigured deployment cannot silently
# authenticate against a third-party host.  Tests that need a value can set
# ``SUPERTOKENS_CONNECTION_URI`` in ``monkeypatch.setenv``.
DEFAULT_API_BASE_PATH: str = "/auth"


@dataclass(slots=True)
class AuthSettings:
    """Configuration for SuperTokens integration."""

    # ── SuperTokens Core ──────────────────────────────────────────────
    connection_uri: str = field(
        default_factory=lambda: _required_env("SUPERTOKENS_CONNECTION_URI")
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
    # ``cookie_secure`` defaults to ``True`` so that production deployments
    # do not silently send session cookies in cleartext.  Set the
    # ``SUPERTOKENS_COOKIE_SECURE=false`` environment variable explicitly
    # for local development over plain HTTP.
    cookie_secure: bool = field(
        default_factory=lambda: os.getenv("SUPERTOKENS_COOKIE_SECURE", "true").lower() != "false"
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
        if not self.connection_uri:
            raise RuntimeError(
                "SUPERTOKENS_CONNECTION_URI environment variable is required. "
                "Set it to your SuperTokens core URI (e.g. https://supertokens.example.com)."
            )


def _required_env(name: str) -> str:
    """Return the value of ``name`` from the environment, or empty string if
    unset.  ``AuthSettings.__post_init__`` validates the result so a missing
    variable produces a clear ``RuntimeError`` at instantiation time.
    """
    return os.getenv(name, "")


def get_auth_settings() -> AuthSettings:
    return AuthSettings()
