"""OSRM road routing (OpenStreetMap data). Durations are free-flow estimates: no live traffic."""
from __future__ import annotations

from datetime import datetime

import httpx

from ..provenance import DataKind, utcnow
from .base import Point, RouteEstimate
from .http import MinIntervalLimiter, ProviderError, RetryPolicy, request_with_retry

NOTES = (
    "OSRM driving profile on OpenStreetMap roads. Duration assumes free-flow speeds and "
    "contains no live or historical traffic."
)


class OsrmProvider:
    name = "osrm"
    traffic_aware = False

    def __init__(self, base_url: str, client: httpx.Client, policy: RetryPolicy, limiter: MinIntervalLimiter | None = None):
        self.base_url = base_url.rstrip("/")
        self.client = client
        self.policy = policy
        self.limiter = limiter

    def is_configured(self) -> bool:
        return bool(self.base_url)

    def route(self, waypoints: list[Point], departure_at: datetime | None = None) -> RouteEstimate:
        if len(waypoints) < 2:
            raise ValueError("need at least two waypoints")
        coords = ";".join(f"{p.lon:.5f},{p.lat:.5f}" for p in waypoints)
        url = f"{self.base_url}/route/v1/driving/{coords}"
        if self.limiter:
            self.limiter.wait()
        resp = request_with_retry(
            self.client, self.name, "GET", url, policy=self.policy, params={"overview": "full", "geometries": "geojson"}
        )
        return parse_osrm(resp.json())


def parse_osrm(payload: dict) -> RouteEstimate:
    if not isinstance(payload, dict) or payload.get("code") != "Ok" or not payload.get("routes"):
        msg = payload.get("message") if isinstance(payload, dict) else "non-object response"
        raise ProviderError("osrm", "invalid_response", f"no route: {msg or payload.get('code')}")
    r = payload["routes"][0]
    try:
        duration = float(r["duration"])
        distance = float(r["distance"])
        coords = r["geometry"]["coordinates"]
        geometry = [(float(lat), float(lon)) for lon, lat in coords]
    except (KeyError, TypeError, ValueError) as e:
        raise ProviderError("osrm", "invalid_response", f"malformed route: {e}") from e
    if duration <= 0 or len(geometry) < 2:
        raise ProviderError("osrm", "invalid_response", "empty route")
    return RouteEstimate(
        provider="osrm",
        kind=DataKind.ESTIMATED,
        traffic_aware=False,
        duration_s=duration,
        distance_m=distance,
        retrieved_at=utcnow(),
        geometry=geometry,
        storable=True,  # ODbL data; store with attribution
        ml_eligible=False,  # free-flow time is constant: not a traffic signal
        map_display_allowed=True,
        notes=NOTES,
    )
