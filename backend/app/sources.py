"""Catalogue of real data sources. Seeded into data_sources and exported into the static snapshot manifest."""
from __future__ import annotations

from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.orm import Session

from .models import DataSource

SOURCES: list[dict] = [
    {
        "id": "osrm",
        "name": "OSRM road routing on OpenStreetMap",
        "kind": "ESTIMATED",
        "license": "Road data © OpenStreetMap contributors, ODbL 1.0",
        "attribution": "© OpenStreetMap contributors (ODbL); routing by OSRM (project-osrm.org)",
        "url": "https://project-osrm.org",
        "notes": "Real OSM road geometry. Durations are free-flow estimates with no traffic. "
        "The public demo server is for light, non-production use.",
        "stale_after_s": 90 * 24 * 3600,
        "storable": True,
    },
    {
        "id": "google-routes",
        "name": "Google Routes API (traffic-aware)",
        "kind": "ESTIMATED",
        "license": "Google Maps Platform Terms of Service",
        "attribution": "Google",
        "url": "https://developers.google.com/maps/documentation/routes",
        "notes": "Optional (MF_GOOGLE_MAPS_API_KEY). Shown on demand as text only; never stored, never drawn on "
        "the map and never used for ML, per Google's terms.",
        "stale_after_s": 15 * 60,
        "storable": False,
    },
    {
        "id": "open-meteo",
        "name": "Open-Meteo current weather",
        "kind": "ESTIMATED",
        "license": "CC BY 4.0 (Open-Meteo); free tier is non-commercial",
        "attribution": "Weather data by Open-Meteo.com",
        "url": "https://open-meteo.com",
        "notes": "Model-based current conditions for central Mumbai, not station measurements.",
        "stale_after_s": 2 * 3600,
        "storable": True,
    },
    {
        "id": "operator-upload",
        "name": "Operator-recorded trip times (CSV upload)",
        "kind": "OBSERVED",
        "license": "Owned by the operator who uploads it",
        "attribution": None,
        "url": None,
        "notes": "Actual departure timestamps and measured journey durations from the operator's own vehicles "
        "(AVL/GPS logs). The only source eligible for ML training.",
        "stale_after_s": 24 * 3600,
        "storable": True,
    },
    {
        "id": "gtfs",
        "name": "GTFS static schedule",
        "kind": "OBSERVED",
        "license": "Per imported feed",
        "attribution": None,
        "url": "https://gtfs.org/schedule/",
        "notes": "Published routes and stops. Schedules are not live vehicle positions. "
        "No verified public Mumbai/BEST feed was available at the time of writing.",
        "stale_after_s": 120 * 24 * 3600,
        "storable": True,
    },
]


def seed_sources(session: Session) -> None:
    for s in SOURCES:
        stmt = insert(DataSource).values(**s)
        stmt = stmt.on_conflict_do_update(index_elements=[DataSource.id], set_={k: v for k, v in s.items() if k != "id"})
        session.execute(stmt)
    session.commit()


def source_by_id(source_id: str) -> dict:
    return next(s for s in SOURCES if s["id"] == source_id)
