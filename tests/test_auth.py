from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from auth.config import AuthSettings, get_auth_settings
from auth.dependencies import get_optional_session, get_session, require_role
from fastapi import HTTPException


class TestAuthSettings:
    def test_default_values_require_connection_uri(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        monkeypatch.delenv("SUPERTOKENS_CONNECTION_URI", raising=False)
        monkeypatch.delenv("SUPERTOKENS_API_KEY", raising=False)
        # No default for SUPERTOKENS_CONNECTION_URI — it must be set explicitly.
        with pytest.raises(RuntimeError, match="SUPERTOKENS_CONNECTION_URI"):
            AuthSettings()

    def test_env_override(self, monkeypatch: pytest.MonkeyPatch) -> None:
        monkeypatch.setenv("SUPERTOKENS_CONNECTION_URI", "https://core.example.com")
        monkeypatch.setenv("SUPERTOKENS_API_KEY", "test-key")
        monkeypatch.setenv("COMPLIANCE_ROLES", "compliance,audit")
        settings = get_auth_settings()
        assert settings.connection_uri == "https://core.example.com"
        assert settings.api_key == "test-key"
        assert settings.compliance_roles == ("compliance", "audit")

    def test_api_key_warning_when_empty(
        self, monkeypatch: pytest.MonkeyPatch, caplog: pytest.LogCaptureFixture
    ) -> None:
        monkeypatch.delenv("SUPERTOKENS_API_KEY", raising=False)
        monkeypatch.setenv("SUPERTOKENS_CONNECTION_URI", "https://core.example.com")
        settings = AuthSettings()
        assert settings.api_key == ""
        # API key is now optional — no warning expected

    def test_cookie_secure_defaults_to_true(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        monkeypatch.delenv("SUPERTOKENS_COOKIE_SECURE", raising=False)
        monkeypatch.setenv("SUPERTOKENS_CONNECTION_URI", "https://core.example.com")
        settings = AuthSettings()
        # ``cookie_secure`` defaults to True so a misconfigured production
        # deployment does not silently send session cookies in cleartext.
        assert settings.cookie_secure is True

    def test_cookie_secure_can_be_disabled(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        monkeypatch.setenv("SUPERTOKENS_COOKIE_SECURE", "false")
        monkeypatch.setenv("SUPERTOKENS_CONNECTION_URI", "https://core.example.com")
        settings = AuthSettings()
        assert settings.cookie_secure is False


class TestGetSession:
    @pytest.mark.asyncio
    async def test_raises_401_when_session_unavailable(self) -> None:
        request = MagicMock()
        with patch(
            "supertokens_python.recipe.session.asyncio.get_session",
            new_callable=AsyncMock,
        ) as mock_get_session:
            from supertokens_python.recipe.session.exceptions import UnauthorisedError
            mock_get_session.side_effect = UnauthorisedError("test")
            with pytest.raises(HTTPException) as exc_info:
                await get_session(request)
            assert exc_info.value.status_code == 401

    @pytest.mark.asyncio
    async def test_returns_session_when_valid(self) -> None:
        request = MagicMock()
        mock_session = MagicMock()
        with patch("supertokens_python.recipe.session.asyncio.get_session", new_callable=AsyncMock) as mock_get_session:
            mock_get_session.return_value = mock_session
            result = await get_session(request)
            assert result == mock_session


class TestGetOptionalSession:
    @pytest.mark.asyncio
    async def test_returns_none_on_error(self) -> None:
        request = MagicMock()
        with patch("supertokens_python.recipe.session.asyncio.get_session", new_callable=AsyncMock) as mock_get_session:
            mock_get_session.side_effect = Exception("fail")
            result = await get_optional_session(request)
            assert result is None

    @pytest.mark.asyncio
    async def test_returns_session_when_valid(self) -> None:
        request = MagicMock()
        mock_session = MagicMock()
        with patch("supertokens_python.recipe.session.asyncio.get_session", new_callable=AsyncMock) as mock_get_session:
            mock_get_session.return_value = mock_session
            result = await get_optional_session(request)
            assert result == mock_session


class TestRequireRole:
    @pytest.fixture(autouse=True)
    def _auth_settings_env(self, monkeypatch: pytest.MonkeyPatch) -> None:
        monkeypatch.setenv("SUPERTOKENS_CONNECTION_URI", "https://core.example.com")

    @pytest.mark.asyncio
    async def test_allows_matching_role(self) -> None:
        mock_session = MagicMock()
        mock_session.get_user_id.return_value = "user-123"
        mock_session.get_access_token_payload.return_value = {}

        with patch(
            "supertokens_python.recipe.userroles.asyncio.get_roles_for_user",
            new_callable=AsyncMock,
        ) as mock_roles:
            mock_roles.return_value = MagicMock(roles=["board_member"])
            dep = require_role("board_member")
            result = await dep(mock_session, AuthSettings())
            assert result == mock_session

    @pytest.mark.asyncio
    async def test_denies_non_matching_role(self) -> None:
        mock_session = MagicMock()
        mock_session.get_user_id.return_value = "user-123"
        mock_session.get_access_token_payload.return_value = {}

        with patch(
            "supertokens_python.recipe.userroles.asyncio.get_roles_for_user",
            new_callable=AsyncMock,
        ) as mock_roles:
            mock_roles.return_value = MagicMock(roles=["viewer"])
            dep = require_role("board_member")
            with pytest.raises(HTTPException) as exc_info:
                await dep(mock_session, AuthSettings())
            assert exc_info.value.status_code == 403

    @pytest.mark.asyncio
    async def test_allows_role_from_token_payload(self) -> None:
        mock_session = MagicMock()
        mock_session.get_user_id.return_value = "user-123"
        mock_session.get_access_token_payload.return_value = {"st-role": {"v": ["compliance_officer"]}}

        with patch(
            "supertokens_python.recipe.userroles.asyncio.get_roles_for_user",
            new_callable=AsyncMock,
        ) as mock_roles:
            mock_roles.return_value = MagicMock(roles=[])
            dep = require_role("compliance_officer")
            result = await dep(mock_session, AuthSettings())
            assert result == mock_session
