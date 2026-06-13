"""Integration provider and system-health monitoring services.

These are the values displayed on the Settings → "API Integration" and
"System Health" tabs.  In production each provider is probed by a
periodic health check; here we expose a CRUD store so the operator can
register, mark disconnected, and inspect the configured integrations
without restarting the service.
"""
from __future__ import annotations

import asyncio
from datetime import UTC, datetime

from governance.models import ProviderStatus, ServiceStatus, UpdateProviderRequest

# Default provider catalogue.  Operators can override the ``status`` and
# ``description`` of each provider, and add new ones via the API.
DEFAULT_PROVIDERS: list[ProviderStatus] = [
    ProviderStatus(
        name="Veriff",
        status="connected",
        last_sync=datetime.now(UTC),
        description="Identity verification & document authentication",
    ),
    ProviderStatus(
        name="OpenSanctions",
        status="connected",
        last_sync=datetime.now(UTC),
        description="Sanctions & PEP screening database",
    ),
    ProviderStatus(
        name="Kyckr",
        status="disconnected",
        last_sync=None,
        description="Corporate registry & UBO identification",
    ),
    ProviderStatus(
        name="AU10TIX",
        status="connected",
        last_sync=datetime.now(UTC),
        description="Document forgery detection & liveness",
    ),
]


# Default service catalogue.  ``last_incident`` is a human-readable
# string (e.g. "2 hours ago") so the UI can display it verbatim.
DEFAULT_SERVICES: list[ServiceStatus] = [
    ServiceStatus(
        name="API Server",
        status="operational",
        uptime_pct=99.98,
        response_time_ms=45,
        last_incident="15 days ago",
        response_history=[42, 48, 44, 46, 43, 45, 47, 44],
    ),
    ServiceStatus(
        name="Database",
        status="operational",
        uptime_pct=99.95,
        response_time_ms=12,
        last_incident="22 days ago",
        response_history=[10, 14, 11, 13, 12, 15, 11, 12],
    ),
    ServiceStatus(
        name="Document Engine",
        status="degraded",
        uptime_pct=98.7,
        response_time_ms=890,
        last_incident="2 hours ago",
        response_history=[120, 150, 200, 350, 500, 650, 780, 890],
    ),
    ServiceStatus(
        name="Sanctions API",
        status="operational",
        uptime_pct=99.9,
        response_time_ms=180,
        last_incident="8 days ago",
        response_history=[175, 182, 178, 185, 179, 183, 181, 180],
    ),
    ServiceStatus(
        name="Notification Service",
        status="operational",
        uptime_pct=99.85,
        response_time_ms=35,
        last_incident="5 days ago",
        response_history=[30, 38, 32, 36, 34, 33, 37, 35],
    ),
    ServiceStatus(
        name="AI Service",
        status="operational",
        uptime_pct=99.2,
        response_time_ms=420,
        last_incident="3 days ago",
        response_history=[380, 410, 395, 430, 415, 425, 400, 420],
    ),
]


class ProviderService:
    def __init__(self) -> None:
        self._providers: dict[str, ProviderStatus] = {
            p.name: p.model_copy() for p in DEFAULT_PROVIDERS
        }
        self._lock = asyncio.Lock()

    async def list_providers(self) -> list[ProviderStatus]:
        async with self._lock:
            return list(self._providers.values())

    async def update_provider(self, request: UpdateProviderRequest) -> ProviderStatus:
        async with self._lock:
            current = self._providers.get(request.name) or ProviderStatus(
                name=request.name, status=request.status, description=request.description
            )
            current.status = request.status
            if request.description:
                current.description = request.description
            current.last_sync = datetime.now(UTC)
            current.healthy = request.status == "connected"
            self._providers[request.name] = current
            return current

    async def get_provider(self, name: str) -> ProviderStatus | None:
        async with self._lock:
            return self._providers.get(name)


class ServiceHealthService:
    def __init__(self) -> None:
        self._services: dict[str, ServiceStatus] = {
            s.name: s.model_copy() for s in DEFAULT_SERVICES
        }
        self._lock = asyncio.Lock()

    async def list_services(self) -> list[ServiceStatus]:
        async with self._lock:
            return list(self._services.values())

    async def record_health_check(
        self,
        *,
        name: str,
        status: str,
        response_time_ms: float,
    ) -> ServiceStatus:
        async with self._lock:
            current = self._services.get(name) or ServiceStatus(
                name=name, status=status, response_time_ms=response_time_ms
            )
            current.status = status
            current.response_time_ms = response_time_ms
            current.response_history.append(response_time_ms)
            # Keep the last 50 samples
            if len(current.response_history) > 50:
                current.response_history = current.response_history[-50:]
            current.healthy = status == "operational"
            current.checked_at = datetime.now(UTC)
            self._services[name] = current
            return current
