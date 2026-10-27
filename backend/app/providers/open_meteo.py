"""Open-Meteo current weather for Mumbai. Values come from weather models (ESTIMATED), not stations."""
from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone

import httpx

from ..provenance import DataKind, utcnow
from .http import ProviderError, RetryPolicy, request_with_retry

CURRENT_VARS = "temperature_2m,precipitation,rain,weather_code,wind_speed_10m"


@dataclass
class WeatherReading:
    kind: DataKind
    valid_at: datetime
    retrieved_at: datetime
    lat: float
    lon: float
    temperature_c: float | None
    precipitation_mm: float | None
    rain_mm: float | None
    weather_code: int | None
    wind_speed_kmh: float | None


class OpenMeteoProvider:
    name = "open-meteo"

    def __init__(self, base_url: str, client: httpx.Client, policy: RetryPolicy, api_key: str | None = None):
        self.base_url = base_url
        self.client = client
        self.policy = policy
        self.api_key = api_key

    def current(self, lat: float, lon: float) -> WeatherReading:
        params = {"latitude": lat, "longitude": lon, "current": CURRENT_VARS, "timezone": "UTC", "wind_speed_unit": "kmh"}
        if self.api_key:
            params["apikey"] = self.api_key
        resp = request_with_retry(self.client, self.name, "GET", self.base_url, policy=self.policy, params=params)
        return parse_open_meteo(resp.json())


def _num(d: dict, k: str) -> float | None:
    v = d.get(k)
    return float(v) if isinstance(v, (int, float)) else None


def parse_open_meteo(payload: dict) -> WeatherReading:
    if not isinstance(payload, dict) or payload.get("error"):
        raise ProviderError("open-meteo", "invalid_response", str(payload.get("reason") if isinstance(payload, dict) else payload))
    cur = payload.get("current")
    if not isinstance(cur, dict) or "time" not in cur:
        raise ProviderError("open-meteo", "invalid_response", "missing 'current' block")
    if payload.get("utc_offset_seconds", 0) != 0:
        raise ProviderError("open-meteo", "invalid_response", "expected UTC timestamps (timezone=UTC)")
    try:
        valid_at = datetime.fromisoformat(str(cur["time"])).replace(tzinfo=timezone.utc)
        lat, lon = float(payload["latitude"]), float(payload["longitude"])
    except (KeyError, ValueError) as e:
        raise ProviderError("open-meteo", "invalid_response", str(e)) from e
    code = cur.get("weather_code")
    return WeatherReading(
        kind=DataKind.ESTIMATED,
        valid_at=valid_at,
        retrieved_at=utcnow(),
        lat=lat,
        lon=lon,
        temperature_c=_num(cur, "temperature_2m"),
        precipitation_mm=_num(cur, "precipitation"),
        rain_mm=_num(cur, "rain"),
        weather_code=int(code) if isinstance(code, (int, float)) else None,
        wind_speed_kmh=_num(cur, "wind_speed_10m"),
    )
