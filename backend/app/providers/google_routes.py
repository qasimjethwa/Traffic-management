"""Google Routes API (computeRoutes, TRAFFIC_AWARE).

Usage constraints from the Google Maps Platform Terms (verified Oct 2026):
  * Service Specific Terms §19.2 — Routes API content must not be used with a non-Google map.
    Mumbai Flow draws on Leaflet/Esri/OSM, so results are shown as text only (map_display_allowed=False).
  * §19.3 — only lat/lng may be cached (≤30 days); durations are therefore never stored.
  * General Terms §3.2.3(c)(vii) — content must not be used to train, test or validate ML models.
Billing: Compute Routes is billed per request (traffic-aware routing is a higher SKU than basic routing;
see https://developers.google.com/maps/billing/pricing). Daily/minute caps are enforced locally.
"""
from __future__ import annotations

import re
from datetime import datetime

import httpx

from ..provenance import DataKind, iso_utc, utcnow
from .base import Point, RouteEstimate
from .http import ProviderError, RetryPolicy, request_with_retry

URL = "https://routes.googleapis.com/directions/v2:computeRoutes"
FIELD_MASK = "routes.duration,routes.staticDuration,routes.distanceMeters"
_DUR = re.compile(r"^(\d+(?:\.\d+)?)s$")


class GoogleRoutesProvider:
    name = "google-routes"
    traffic_aware = True

    def __init__(self, api_key: str | None, client: httpx.Client, policy: RetryPolicy):
        self.api_key = api_key
        self.client = client
        self.policy = policy

    def is_configured(self) -> bool:
        return bool(self.api_key)

    def route(self, waypoints: list[Point], departure_at: datetime | None = None) -> RouteEstimate:
        if not self.api_key:
            raise ProviderError(self.name, "not_configured", "set MF_GOOGLE_MAPS_API_KEY to enable traffic-aware estimates")
        if len(waypoints) != 2:
            raise ValueError("Google Routes adapter supports origin and destination only")
        o, d = waypoints
        body: dict = {
            "origin": {"location": {"latLng": {"latitude": o.lat, "longitude": o.lon}}},
            "destination": {"location": {"latLng": {"latitude": d.lat, "longitude": d.lon}}},
            "travelMode": "DRIVE",
            "routingPreference": "TRAFFIC_AWARE",
        }
        if departure_at is not None:
            body["departureTime"] = iso_utc(departure_at)
        resp = request_with_retry(
            self.client,
            self.name,
            "POST",
            URL,
            policy=self.policy,
            json=body,
            headers={"X-Goog-Api-Key": self.api_key, "X-Goog-FieldMask": FIELD_MASK},
        )
        return parse_google_routes(resp.json(), departure_at)


def _seconds(v: object) -> float:
    m = _DUR.match(str(v))
    if not m:
        raise ValueError(f"bad duration {v!r}")
    return float(m.group(1))


def parse_google_routes(payload: dict, departure_at: datetime | None = None) -> RouteEstimate:
    routes = payload.get("routes") if isinstance(payload, dict) else None
    if not routes:
        raise ProviderError("google-routes", "invalid_response", "no route returned")
    r = routes[0]
    try:
        duration = _seconds(r["duration"])
        static = _seconds(r["staticDuration"]) if "staticDuration" in r else None
        distance = float(r["distanceMeters"]) if "distanceMeters" in r else None
    except (KeyError, ValueError) as e:
        raise ProviderError("google-routes", "invalid_response", str(e)) from e
    return RouteEstimate(
        provider="google-routes",
        kind=DataKind.ESTIMATED,
        traffic_aware=True,
        duration_s=duration,
        distance_m=distance,
        retrieved_at=utcnow(),
        departure_at=departure_at,
        geometry=None,
        storable=False,
        ml_eligible=False,
        map_display_allowed=False,
        notes="Traffic-aware estimate from Google Routes API. Not stored, not drawn on the map, not used for ML (Google terms).",
        extra={"static_duration_s": static},
    )
