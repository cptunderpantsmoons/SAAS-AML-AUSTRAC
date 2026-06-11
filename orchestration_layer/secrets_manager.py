from __future__ import annotations

import json
import logging
from typing import Any

logger = logging.getLogger("orchestration_layer.secrets_manager")


class SecretsManagerError(Exception):
    """Raised when a secrets operation fails."""


class SecretsManagerClient:
    """Thin wrapper around AWS Secrets Manager.

    In local/dev environments, falls back to environment variables when the
    AWS call fails (or when ``boto3`` is not installed).
    """

    def __init__(self, prefix: str, aws_region: str = "ap-southeast-2") -> None:
        self._prefix = prefix.rstrip("/")
        self._region = aws_region
        self._cache: dict[str, dict[str, Any]] = {}
        self._client: Any = None

    def _get_client(self) -> Any:
        if self._client is not None:
            return self._client
        try:
            import boto3

            self._client = boto3.client("secretsmanager", region_name=self._region)
        except ModuleNotFoundError:
            logger.warning("boto3 not installed — secrets manager will use env-var fallback")
            self._client = None
        return self._client

    def _secret_name(self, key: str) -> str:
        return f"{self._prefix}/{key}"

    async def get_secret(self, key: str) -> dict[str, Any]:
        """Retrieve and cache a secret by key.

        Returns the secret as a dict (parsed from JSON).
        Falls back to an env-var ``<KEY>_SECRET`` on failure.
        """
        if key in self._cache:
            return self._cache[key]

        client = self._get_client()
        if client is not None:
            try:
                response = client.get_secret_value(SecretId=self._secret_name(key))
                secret_string = response.get("SecretString", "{}")
                parsed: dict[str, Any] = json.loads(secret_string)
                self._cache[key] = parsed
                return parsed
            except Exception as exc:
                logger.error("failed to fetch secret %s: %s", key, exc)

        # Env-var fallback
        import os

        env_key = key.upper().replace("/", "_")
        env_val = os.getenv(f"{env_key}_SECRET", "")
        if env_val:
            try:
                parsed = json.loads(env_val)
            except json.JSONDecodeError:
                parsed = {"value": env_val}
            self._cache[key] = parsed
            return parsed

        raise SecretsManagerError(f"Secret '{key}' not found in Secrets Manager or env vars")

    async def get_api_key(self, provider: str) -> str:
        """Convenience: fetch an API key for a given provider.

        *provider* should be a simple name like ``"veriff"`` or a path
        like ``"providers/veriff"``.  If it doesn't start with ``providers/``
        the prefix is added automatically.
        """
        if not provider.startswith("providers/"):
            provider = f"providers/{provider}"
        secret = await self.get_secret(provider)
        api_key: str = secret.get("api_key", "")
        if not api_key:
            raise SecretsManagerError(f"No api_key found for provider '{provider}'")
        return api_key

    def clear_cache(self) -> None:
        self._cache.clear()
