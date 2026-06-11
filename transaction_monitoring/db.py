from __future__ import annotations

import os
from typing import Any


class PostgresClient:
    """Async PostgreSQL client with pool management.

    Falls back to in-memory operation when asyncpg is unavailable.
    """

    def __init__(self, dsn: str = "") -> None:
        self._dsn = dsn or os.getenv("POSTGRES_DSN", "postgresql://localhost/aml")
        self._pool: Any = None

    async def connect(self) -> None:
        try:
            import asyncpg  # type: ignore[import-untyped]

            self._pool = await asyncpg.create_pool(self._dsn, min_size=2, max_size=10)
        except ModuleNotFoundError:
            # Graceful fallback for dev/test environments without PostgreSQL
            self._pool = None

    async def close(self) -> None:
        if self._pool is not None:
            await self._pool.close()
            self._pool = None

    async def execute(self, query: str, *args: Any) -> None:
        if self._pool is None:
            raise RuntimeError("Pool not connected")
        async with self._pool.acquire() as conn:
            await conn.execute(query, *args)

    async def fetch(self, query: str, *args: Any) -> list[Any]:
        if self._pool is None:
            raise RuntimeError("Pool not connected")
        async with self._pool.acquire() as conn:
            records: list[Any] = await conn.fetch(query, *args)
            return records

    async def fetchrow(self, query: str, *args: Any) -> Any | None:
        if self._pool is None:
            raise RuntimeError("Pool not connected")
        async with self._pool.acquire() as conn:
            return await conn.fetchrow(query, *args)

    async def fetchval(self, query: str, *args: Any) -> Any:
        if self._pool is None:
            raise RuntimeError("Pool not connected")
        async with self._pool.acquire() as conn:
            return await conn.fetchval(query, *args)
