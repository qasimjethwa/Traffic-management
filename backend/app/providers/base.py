"""Provider-neutral routing interface."""
from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime
from typing import Protocol

from ..provenance import DataKind


@dataclass(frozen=True)
class Point:
    lat: float
    lon: float


@dataclass
class RouteEstimate:
    provider: str
    kind: DataKind
    traffic_aware: bool
    duration_s: float
    distance_m: float | None
    retrieved_at: datetime
    departure_at: datetime | None = None
    # (lat, lon) pairs; None when the provider's terms forbid drawing it on our (non-Google) map.
    geometry: list[tuple[float, float]] | None = None
    # Usage rights carried with the value, enforced by the ingestion jobs and the API.
    storable: bool = True
    ml_eligible: bool = False
    map_display_allowed: bool = True
    notes: str = ""
    extra: dict = field(default_factory=dict)


class RoutingProvider(Protocol):
    name: str
    traffic_aware: bool

    def is_configured(self) -> bool: ...

    def route(self, waypoints: list[Point], departure_at: datetime | None = None) -> RouteEstimate: ...
