"""Top-level pytest configuration.

Sets default environment variables that the application's settings
modules read at import time.  Tests that need a specific value should
override via ``monkeypatch.setenv`` (which works correctly because the
underlying ``AuthSettings`` is recreated by each ``get_auth_settings()``
call).

We deliberately use safe placeholder values (``.invalid`` TLD, ``test-``
prefixes) so the test suite never inadvertently authenticates against a
real production system if an env var leaks.
"""
from __future__ import annotations

import os

# Provide sensible defaults for the SuperTokens integration.  Tests
# that exercise auth in detail set explicit values per-test.
os.environ.setdefault("SUPERTOKENS_CONNECTION_URI", "https://supertokens.test.invalid")
os.environ.setdefault("SUPERTOKENS_API_KEY", "test-key")
os.environ.setdefault("SUPERTOKENS_COOKIE_SECURE", "false")
os.environ.setdefault("SUPERTOKENS_ENABLE_MIDDLEWARE", "false")
os.environ.setdefault("AML_ENV", "development")
