"""Sanctions screening service.

The compliance officer's SanctionsScreeningPanel needs three things:
the configured sanctions sources, the list of historical matches
(those the system has previously scored), and a screen-by-query
endpoint that scores a name against the configured sources.

In production this proxies through the OpenSanctions adapter (and any
other configured providers).  In local dev we maintain an in-memory
list of seeded matches plus a deterministic name-similarity scoring
function so the UI can be exercised end-to-end.
"""
from __future__ import annotations

import asyncio
from datetime import UTC, datetime
from difflib import SequenceMatcher
from uuid import UUID

from governance.models import (
    SanctionsMatch,
    SanctionsSource,
    ScreenRequest,
    UpdateSanctionsMatchRequest,
)

# Seed of plausible listed entities.  These are synthetic — the real
# service would pull the consolidated OFAC / UN / EU / DFAT lists.
LISTED_ENTITIES: list[dict[str, str]] = [
    {"id": "ofac-sdn-1001", "name": "John Smith Holdings", "program": "OFAC SDN", "source": "OFAC"},
    {"id": "un-1267-2034", "name": "Acme Trading Co", "program": "UN 1267", "source": "UN"},
    {"id": "dfat-csl-2017-9", "name": "Vladimir Petrov", "program": "DFAT CSL", "source": "DFAT"},
    {"id": "ofac-sdn-2010", "name": "Maria Garcia", "program": "OFAC SDN", "source": "OFAC"},
    {"id": "eu-cfsp-0091", "name": "Khalil al-Hassan", "program": "EU CFSP", "source": "EU"},
    {"id": "ofac-sdn-3388", "name": "Pacific Holdings LLC", "program": "OFAC SDN", "source": "OFAC"},
    {"id": "un-1267-4011", "name": "Ahmad Trading FZE", "program": "UN 1267", "source": "UN"},
    {"id": "dfat-csl-2019-44", "name": "North Star Industries", "program": "DFAT CSL", "source": "DFAT"},
]


class SanctionsService:
    def __init__(self) -> None:
        self._sources: dict[str, SanctionsSource] = {
            "OFAC": SanctionsSource(
                id="ofac",
                name="OFAC SDN",
                enabled=True,
                last_check=datetime.now(UTC),
                entries_indexed=8234,
            ),
            "UN": SanctionsSource(
                id="un",
                name="United Nations 1267",
                enabled=True,
                last_check=datetime.now(UTC),
                entries_indexed=612,
            ),
            "EU": SanctionsSource(
                id="eu",
                name="EU Consolidated",
                enabled=True,
                last_check=datetime.now(UTC),
                entries_indexed=1288,
            ),
            "DFAT": SanctionsSource(
                id="dfat",
                name="DFAT Consolidated List",
                enabled=True,
                last_check=datetime.now(UTC),
                entries_indexed=415,
            ),
        }
        self._matches: dict[UUID, SanctionsMatch] = {}
        self._lock = asyncio.Lock()

    async def list_sources(self) -> list[SanctionsSource]:
        async with self._lock:
            return list(self._sources.values())

    async def list_matches(
        self,
        *,
        status: str | None = None,
        client_id: str | None = None,
        source: str | None = None,
        page: int = 1,
        page_size: int = 100,
    ) -> tuple[list[SanctionsMatch], int]:
        async with self._lock:
            results = list(self._matches.values())

        if status is not None:
            results = [m for m in results if m.status == status]
        if client_id is not None:
            results = [m for m in results if m.client_id == client_id]
        if source is not None:
            results = [m for m in results if m.source == source]

        results.sort(key=lambda m: m.screened_at, reverse=True)

        total = len(results)
        start = max(0, (page - 1) * page_size)
        return results[start : start + page_size], total

    async def screen(self, request: ScreenRequest) -> list[SanctionsMatch]:
        """Score ``request.query`` against all configured sources.

        Returns the top-N matches (capped at 25) sorted by descending
        confidence.  The query is matched against ``LISTED_ENTITIES``
        with a fuzzy string similarity; the ``match_type`` field tells
        the UI whether the match is ``Exact`` (>0.95), ``Partial``
        (>0.75) or ``Fuzzy`` (<=0.75).
        """
        scored: list[SanctionsMatch] = []
        needle = request.query.strip().lower()
        if not needle:
            return scored
        now = datetime.now(UTC)
        for entry in LISTED_ENTITIES:
            ratio = SequenceMatcher(None, needle, entry["name"].lower()).ratio()
            if ratio < 0.6:
                continue
            confidence = round(ratio * 100, 1)
            if confidence >= 95:
                match_type = "Exact"
            elif confidence >= 75:
                match_type = "Partial"
            else:
                match_type = "Fuzzy"
            scored.append(
                SanctionsMatch(
                    client_id=request.client_id,
                    client_name=request.client_name or request.query,
                    source=entry["source"],
                    confidence=confidence,
                    match_type=match_type,
                    listed_entity=entry["name"],
                    listed_entity_id=entry["id"],
                    program=entry["program"],
                    screened_at=now,
                )
            )
        scored.sort(key=lambda m: m.confidence, reverse=True)
        scored = scored[:25]
        async with self._lock:
            for m in scored:
                self._matches[m.id] = m
        return scored

    async def update_match(
        self, match_id: UUID, request: UpdateSanctionsMatchRequest
    ) -> SanctionsMatch:
        async with self._lock:
            match = self._matches.get(match_id)
            if match is None:
                raise KeyError(f"Match {match_id} not found")
            match.status = request.status
            return match
