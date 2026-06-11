from __future__ import annotations

import pytest
from orchestration_layer.secrets_manager import SecretsManagerClient, SecretsManagerError


class TestSecretsManagerClient:
    @pytest.mark.asyncio
    async def test_env_var_fallback(self, monkeypatch: pytest.MonkeyPatch) -> None:
        monkeypatch.setenv("PROVIDERS_VERIFF_SECRET", '{"api_key": "test-key-123"}')
        client = SecretsManagerClient(prefix="aml-au/orchestration", aws_region="ap-southeast-2")

        result = await client.get_secret("providers/veriff")
        assert result["api_key"] == "test-key-123"

    @pytest.mark.asyncio
    async def test_env_var_fallback_plain_string(self, monkeypatch: pytest.MonkeyPatch) -> None:
        monkeypatch.setenv("MY_TOKEN_SECRET", "simple-token")
        client = SecretsManagerClient(prefix="test", aws_region="ap-southeast-2")

        result = await client.get_secret("my_token")
        assert result["value"] == "simple-token"

    @pytest.mark.asyncio
    async def test_raises_when_not_found(self, monkeypatch: pytest.MonkeyPatch) -> None:
        monkeypatch.delenv("AWS_ACCESS_KEY_ID", raising=False)
        monkeypatch.delenv("NONEXISTENT_SECRET", raising=False)
        client = SecretsManagerClient(prefix="test", aws_region="ap-southeast-2")

        with pytest.raises(SecretsManagerError, match="not found"):
            await client.get_secret("nonexistent")

    @pytest.mark.asyncio
    async def test_get_api_key(self, monkeypatch: pytest.MonkeyPatch) -> None:
        monkeypatch.setenv("PROVIDERS_VERIFF_SECRET", '{"api_key": "vk-abc"}')
        client = SecretsManagerClient(prefix="aml-au/orchestration", aws_region="ap-southeast-2")

        key = await client.get_api_key("veriff")
        assert key == "vk-abc"

    @pytest.mark.asyncio
    async def test_get_api_key_missing_key_raises(self, monkeypatch: pytest.MonkeyPatch) -> None:
        monkeypatch.setenv("PROVIDERS_BAD_SECRET", '{"not_api_key": "oops"}')
        client = SecretsManagerClient(prefix="aml-au/orchestration", aws_region="ap-southeast-2")

        with pytest.raises(SecretsManagerError, match="No api_key"):
            await client.get_api_key("bad")

    @pytest.mark.asyncio
    async def test_cache_is_used(self, monkeypatch: pytest.MonkeyPatch) -> None:
        monkeypatch.setenv("CACHED_SECRET", '{"val": "1"}')
        client = SecretsManagerClient(prefix="test", aws_region="ap-southeast-2")

        result1 = await client.get_secret("cached")
        result2 = await client.get_secret("cached")
        assert result1 == result2
        assert "cached" in client._cache

    @pytest.mark.asyncio
    async def test_clear_cache(self, monkeypatch: pytest.MonkeyPatch) -> None:
        monkeypatch.setenv("TO_CLEAR_SECRET", '{"v": "1"}')
        client = SecretsManagerClient(prefix="test", aws_region="ap-southeast-2")

        await client.get_secret("to_clear")
        assert "to_clear" in client._cache
        client.clear_cache()
        assert "to_clear" not in client._cache
