"""Shared provenance vocabulary, freshness and time helpers (mirrors src/types/provenance.ts)."""
from __future__ import annotations

import enum
from datetime import datetime, timezone
from zoneinfo import ZoneInfo

IST = ZoneInfo("Asia/Kolkata")

# Mumbai Metropolitan Region bounding box used to validate imported coordinates.
MMR_BBOX = (18.82, 72.68, 19.42, 73.22)  # min_lat, min_lon, max_lat, max_lon


class DataKind(str, enum.Enum):
    OBSERVED = "OBSERVED"
    ESTIMATED = "ESTIMATED"
    FORECAST = "FORECAST"
    SIMULATED = "SIMULATED"


REAL_KINDS = (DataKind.OBSERVED, DataKind.ESTIMATED, DataKind.FORECAST)


class Freshness(str, enum.Enum):
    FRESH = "fresh"
    STALE = "stale"
    UNKNOWN = "unknown"
    UNAVAILABLE = "unavailable"


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


def ensure_utc(dt: datetime) -> datetime:
    """Reject naive datetimes (ambiguous) and normalise aware ones to UTC."""
    if dt.tzinfo is None or dt.tzinfo.utcoffset(dt) is None:
        raise ValueError("timestamp must include a timezone offset")
    return dt.astimezone(timezone.utc)


def to_ist_str(dt: datetime | None) -> str:
    if dt is None:
        return "—"
    return ensure_utc(dt).astimezone(IST).strftime("%d %b %Y %H:%M IST")


def iso_utc(dt: datetime | None) -> str | None:
    if dt is None:
        return None
    return ensure_utc(dt).isoformat().replace("+00:00", "Z")


def freshness(ts: datetime | None, stale_after_s: float | None, now: datetime | None = None) -> Freshness:
    if ts is None:
        return Freshness.UNAVAILABLE
    if stale_after_s is None:
        return Freshness.UNKNOWN
    now = now or utcnow()
    return Freshness.STALE if (now - ensure_utc(ts)).total_seconds() > stale_after_s else Freshness.FRESH


def in_mmr(lat: float, lon: float) -> bool:
    min_lat, min_lon, max_lat, max_lon = MMR_BBOX
    return min_lat <= lat <= max_lat and min_lon <= lon <= max_lon
