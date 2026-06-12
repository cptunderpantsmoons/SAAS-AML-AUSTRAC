"""Auth package — SuperTokens integration for AML/CTF SaaS platform."""
from __future__ import annotations

from auth.config import AuthSettings, get_auth_settings
from auth.dependencies import (
    get_optional_session,
    get_session,
    require_board_member,
    require_compliance_officer,
    require_role,
)
from auth.supertokens_init import init_supertokens, setup_supertokens_middleware

__all__ = [
    "AuthSettings",
    "get_auth_settings",
    "get_optional_session",
    "get_session",
    "init_supertokens",
    "require_board_member",
    "require_compliance_officer",
    "require_role",
    "setup_supertokens_middleware",
]
