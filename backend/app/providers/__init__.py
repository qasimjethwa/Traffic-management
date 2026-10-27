"""Provider registry. Construct providers from settings so tests can inject an httpx transport."""
from __future__ import annotations

import httpx

from ..config import Settings
from .google_routes import GoogleRoutesProvider
from .http import MinIntervalLimiter, ProviderError, RetryPolicy
from .open_meteo import OpenMeteoProvider
from .osrm import OsrmProvider

__all__ = ["Providers", "ProviderError", "build_providers"]

_osrm_limiter: MinIntervalLimiter | None = None


class Providers:
    def __init__(self, osrm: OsrmProvider, google: GoogleRoutesProvider, weather: OpenMeteoProvider):
        self.osrm = osrm
        self.google = google
        self.weather = weather

    def routing(self, name: str):
        if name == "osrm":
            return self.osrm
        if name == "google-routes":
            return self.google
        raise KeyError(name)


def build_providers(settings: Settings, transport: httpx.BaseTransport | None = None) -> Providers:
    global _osrm_limiter
    if _osrm_limiter is None:
        _osrm_limiter = MinIntervalLimiter(settings.osrm_min_interval_s)
    client = httpx.Client(
        timeout=settings.http_timeout_s,
        transport=transport,
        headers={"User-Agent": "MumbaiFlow/1.0 (+https://github.com/; traffic-intelligence prototype)"},
    )
    policy = RetryPolicy(settings.http_retries, settings.http_backoff_s)
    return Providers(
        osrm=OsrmProvider(settings.osrm_url, client, policy, None if transport else _osrm_limiter),
        google=GoogleRoutesProvider(settings.google_maps_api_key, client, policy),
        weather=OpenMeteoProvider(settings.open_meteo_url, client, policy, settings.open_meteo_api_key),
    )
