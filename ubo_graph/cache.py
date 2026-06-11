from __future__ import annotations

import json
import logging
from typing import Any

logger = logging.getLogger("ubo_graph.cache")

DEFAULT_TTL_SECONDS = 300  # 5 minutes


class InMemoryCache:
    """Simple TTL cache for development and testing."""

    def __init__(self) -> None:
        self._store: dict[str, tuple[float, str]] = {}  # key → (expires_at, value_json)
        self._hits = 0
        self._misses = 0

    def get(self, key: str) -> dict[str, Any] | None:
        import time

        entry = self._store.get(key)
        if entry is None:
            self._misses += 1
            return None
        expires_at, value_json = entry
        if time.monotonic() > expires_at:
            del self._store[key]
            self._misses += 1
            return None
        self._hits += 1
        result: dict[str, Any] | None = json.loads(value_json)
        return result

    def set(self, key: str, value: dict[str, Any], ttl_seconds: int = DEFAULT_TTL_SECONDS) -> None:
        import time

        self._store[key] = (time.monotonic() + ttl_seconds, json.dumps(value, default=str))

    def delete(self, key: str) -> None:
        self._store.pop(key, None)

    def clear(self) -> None:
        self._store.clear()
        self._hits = 0
        self._misses = 0

    @property
    def hit_rate(self) -> float:
        total = self._hits + self._misses
        return self._hits / total if total > 0 else 0.0

    @property
    def size(self) -> int:
        return len(self._store)


class RedisCache:
    """Redis-backed cache with graceful fallback to in-memory store."""

    def __init__(
        self,
        redis_url: str = "redis://localhost:6379/0",
        ttl_seconds: int = DEFAULT_TTL_SECONDS,
        key_prefix: str = "ubo:",
    ) -> None:
        self._redis_url = redis_url
        self._ttl = ttl_seconds
        self._prefix = key_prefix
        self._client: Any = None
        self._fallback = InMemoryCache()
        self._using_fallback = True

    async def connect(self) -> None:
        try:
            import redis.asyncio as aioredis

            self._client = aioredis.from_url(self._redis_url, decode_responses=True)
            await self._client.ping()
            self._using_fallback = False
            logger.info("Connected to Redis at %s", self._redis_url)
        except Exception as exc:
            logger.warning("Redis unavailable (%s) — using in-memory cache", exc)
            self._using_fallback = True

    async def close(self) -> None:
        if self._client is not None:
            await self._client.close()
            self._client = None

    @property
    def using_fallback(self) -> bool:
        return self._using_fallback

    @property
    def fallback_store(self) -> InMemoryCache:
        return self._fallback

    def _cache_key(self, entity_id: str) -> str:
        return f"{self._prefix}{entity_id}"

    async def get(self, entity_id: str) -> dict[str, Any] | None:
        key = self._cache_key(entity_id)
        if self._using_fallback:
            return self._fallback.get(key)
        try:
            raw = await self._client.get(key)
            if raw is None:
                return None
            result: dict[str, Any] | None = json.loads(raw)
            return result
        except Exception as exc:
            logger.warning("Redis GET failed for %s: %s", key, exc)
            return self._fallback.get(key)

    async def set(self, entity_id: str, value: dict[str, Any], ttl_seconds: int | None = None) -> None:
        key = self._cache_key(entity_id)
        ttl = ttl_seconds or self._ttl
        if self._using_fallback:
            self._fallback.set(key, value, ttl_seconds=ttl)
            return
        try:
            await self._client.set(key, json.dumps(value, default=str), ex=ttl)
        except Exception as exc:
            logger.warning("Redis SET failed for %s: %s", key, exc)
            self._fallback.set(key, value, ttl_seconds=ttl)

    async def delete(self, entity_id: str) -> None:
        key = self._cache_key(entity_id)
        if self._using_fallback:
            self._fallback.delete(key)
            return
        try:
            await self._client.delete(key)
        except Exception as exc:
            logger.warning("Redis DELETE failed for %s: %s", key, exc)
            self._fallback.delete(key)

    async def clear(self) -> None:
        if self._using_fallback:
            self._fallback.clear()
            return
        try:
            async for key in self._client.scan_iter(match=f"{self._prefix}*"):
                await self._client.delete(key)
        except Exception as exc:
            logger.warning("Redis CLEAR failed: %s", exc)
            self._fallback.clear()


def create_cache(
    redis_url: str = "redis://localhost:6379/0",
    ttl_seconds: int = DEFAULT_TTL_SECONDS,
) -> RedisCache:
    return RedisCache(redis_url=redis_url, ttl_seconds=ttl_seconds)
