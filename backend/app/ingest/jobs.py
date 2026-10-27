"""Repeatable ingestion jobs. Each job records an ingestion_runs row with inserted/duplicate/invalid counts."""
from __future__ import annotations

import csv
import hashlib
import json
import math
from datetime import datetime, timedelta
from pathlib import Path

from geoalchemy2.shape import from_shape
from shapely.geometry import LineString
from sqlalchemy import delete, select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.orm import Session

from ..config import Settings
from ..models import Corridor, JourneyObservation, OdPair, WeatherObservation
from ..provenance import DataKind, ensure_utc, in_mmr, iso_utc, utcnow
from ..providers import Providers, ProviderError
from ..providers.base import RouteEstimate
from ..sources import SOURCES, seed_sources
from .reference import load_corridors, load_od_pairs
from .runs import RunStats, call_logged, ingestion_run

MUMBAI_WEATHER_POINT = (19.076, 72.8777)


def _haversine_km(a: tuple[float, float], b: tuple[float, float]) -> float:
    la1, lo1, la2, lo2 = map(math.radians, (*a, *b))
    h = math.sin((la2 - la1) / 2) ** 2 + math.cos(la1) * math.cos(la2) * math.sin((lo2 - lo1) / 2) ** 2
    return 2 * 6371 * math.asin(math.sqrt(h))


def _polyline_km(pts: list[tuple[float, float]]) -> float:
    return sum(_haversine_km(pts[i - 1], pts[i]) for i in range(1, len(pts)))


def _thin(line: list[tuple[float, float]], max_points: int = 220) -> list[tuple[float, float]]:
    if len(line) <= max_points:
        return line
    step = (len(line) - 1) / (max_points - 1)
    return [line[round(i * step)] for i in range(max_points)]


def _point_segment_km(p: tuple[float, float], a: tuple[float, float], b: tuple[float, float]) -> float:
    # local equirectangular projection (fine at city scale)
    k = math.cos(math.radians(p[0]))
    ax, ay, bx, by, px, py = a[1] * k, a[0], b[1] * k, b[0], p[1] * k, p[0]
    dx, dy = bx - ax, by - ay
    t = 0.0 if dx == dy == 0 else max(0.0, min(1.0, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)))
    return math.hypot(px - (ax + t * dx), py - (ay + t * dy)) * 111.32


def adherence(waypoints: list[tuple[float, float]], line: list[tuple[float, float]], tol_km: float = 0.5) -> float:
    """Share of reference waypoints within tol_km of the routed line."""
    if len(line) < 2:
        return 0.0
    near = sum(1 for w in waypoints if min(_point_segment_km(w, line[i - 1], line[i]) for i in range(1, len(line))) <= tol_km)
    return near / len(waypoints)


def validate_corridor_route(waypoints: list[tuple[float, float]], est: RouteEstimate) -> list[str]:
    """Returns validation problems (empty = valid)."""
    problems = []
    geom = est.geometry or []
    outside = sum(1 for lat, lon in geom if not in_mmr(lat, lon))
    if outside:
        problems.append(f"{outside} points outside the MMR bounding box")
    expected = _polyline_km(waypoints)
    got = (est.distance_m or 0) / 1000
    if expected > 0 and not (0.8 <= got / expected <= 1.5):
        problems.append(f"routed length {got:.1f} km vs waypoint length {expected:.1f} km is implausible")
    share = adherence(waypoints, est.geometry or [])
    if share < 0.8:
        problems.append(f"only {share:.0%} of reference waypoints lie within 500 m of the routed road")
    return problems


def _strategies(points: list) -> list[tuple[str, list]]:
    """Waypoint subsets to try. Dense waypoints can snap to the opposite carriageway and force U-turn detours,
    so sparser subsets are tried next; every result must still pass validate_corridor_route."""
    n = len(points)
    out = [("all-waypoints", points)]
    if n > 4:
        out.append(("every-other-waypoint", points[::2] if (n - 1) % 2 == 0 else [*points[::2], points[-1]]))
        out.append(("thirds", [points[0], points[n // 3], points[2 * n // 3], points[-1]]))
    out.append(("endpoints", [points[0], points[-1]]))
    return out


def sync_od_pairs(session: Session, settings: Settings) -> int:
    pairs = load_od_pairs(settings.reference_dir)
    for p in pairs:
        if not (in_mmr(p.origin.lat, p.origin.lon) and in_mmr(p.destination.lat, p.destination.lon)):
            raise ValueError(f"OD pair {p.id} lies outside the MMR bounding box")
        values = dict(
            id=p.id,
            name=p.name,
            origin_name=p.origin_name,
            destination_name=p.destination_name,
            origin=f"SRID=4326;POINT({p.origin.lon} {p.origin.lat})",
            destination=f"SRID=4326;POINT({p.destination.lon} {p.destination.lat})",
        )
        stmt = insert(OdPair).values(**values).on_conflict_do_update(
            index_elements=[OdPair.id], set_={k: v for k, v in values.items() if k != "id"}
        )
        session.execute(stmt)
    session.commit()
    return len(pairs)


# ---------------------------------------------------------------- corridors (OSRM / OpenStreetMap)
def import_corridors(session: Session | None, settings: Settings, providers: Providers, write_snapshot: bool = True) -> RunStats:
    """Snaps every reference corridor to real OSM roads via OSRM; stores it and writes the static snapshot."""
    refs = load_corridors(settings.reference_dir)
    features: list[dict] = []
    stats = RunStats()

    def work(stats: RunStats) -> None:
        for ref in refs:
            wps = [(p.lat, p.lon) for p in ref.waypoints]
            est, strategy, problems, failed = None, None, [], None
            for name, pts in _strategies(ref.waypoints):
                try:
                    cand = providers.osrm.route(pts) if session is None else call_logged(session, "osrm", lambda pts=pts: providers.osrm.route(pts))
                except ProviderError as e:
                    failed = e.kind
                    break
                problems = validate_corridor_route(wps, cand)
                if not problems:
                    est, strategy = cand, name
                    break
            if failed:
                stats.errors.append(f"{ref.id}: {failed}")
                continue
            if est is None:
                stats.invalid += 1
                stats.errors.append(f"{ref.id}: {'; '.join(problems)}")
                continue
            line = _thin(est.geometry or [])
            if session is not None:
                values = dict(
                    id=ref.id,
                    name=ref.name,
                    route_code=ref.route_code,
                    geom=from_shape(LineString([(lon, lat) for lat, lon in est.geometry or []]), srid=4326),
                    length_km=(est.distance_m or 0) / 1000,
                    free_flow_duration_s=est.duration_s,
                    source_id="osrm",
                    retrieved_at=est.retrieved_at,
                )
                session.execute(
                    insert(Corridor).values(**values).on_conflict_do_update(
                        index_elements=[Corridor.id], set_={k: v for k, v in values.items() if k != "id"}
                    )
                )
                session.commit()
            stats.inserted += 1
            features.append(
                {
                    "type": "Feature",
                    "geometry": {"type": "LineString", "coordinates": [[round(lon, 6), round(lat, 6)] for lat, lon in line]},
                    "properties": {
                        "id": ref.id,
                        "name": ref.name,
                        "routeCode": ref.route_code,
                        "lengthKm": round((est.distance_m or 0) / 1000, 2),
                        "freeFlowDurationS": round(est.duration_s),
                        "snapStrategy": strategy,
                        "provenance": {
                            "kind": "ESTIMATED",
                            "source": "osrm",
                            "sourceName": "OSRM road routing on OpenStreetMap",
                            "retrievedAt": iso_utc(est.retrieved_at),
                            "notes": "Road geometry from OpenStreetMap; duration is free-flow (no traffic).",
                        },
                    },
                }
            )
        stats.details = {"corridors": len(refs), "snapped": len(features)}
        if session is not None and not any(": " in e and e.split(": ", 1)[1] in ("timeout", "unreachable", "http_error", "rate_limited") for e in stats.errors):
            # A corridor that no longer validates must not keep an older geometry in the database.
            accepted = [f["properties"]["id"] for f in features]
            session.execute(delete(Corridor).where(Corridor.id.not_in(accepted)))
            session.commit()

    if session is not None:
        seed_sources(session)
        with ingestion_run(session, "import-corridors", "osrm") as s:
            work(s)
            stats = s
    else:
        work(stats)

    if write_snapshot and features:
        write_corridor_snapshot(settings.static_snapshot_dir, features, stats)
    return stats


def write_corridor_snapshot(out_dir: Path, features: list[dict], stats: RunStats) -> None:
    out_dir.mkdir(parents=True, exist_ok=True)
    generated = iso_utc(utcnow())
    (out_dir / "corridors.geojson").write_text(json.dumps({"type": "FeatureCollection", "features": features}, separators=(",", ":")))
    retrieved = max(f["properties"]["provenance"]["retrievedAt"] for f in features)
    osrm = next(s for s in SOURCES if s["id"] == "osrm")
    manifest = {
        "schemaVersion": 1,
        "generatedAt": generated,
        "generatedBy": "backend: python -m app.cli import-corridors",
        "datasets": [
            {
                "id": "corridors",
                "file": "corridors.geojson",
                "kind": "ESTIMATED",
                "source": "osrm",
                "sourceName": osrm["name"],
                "license": osrm["license"],
                "attribution": osrm["attribution"],
                "retrievedAt": retrieved,
                "staleAfterSeconds": osrm["stale_after_s"],
                "records": len(features),
                "validation": {"invalid": stats.invalid, "errors": stats.errors},
                "notes": osrm["notes"],
            }
        ],
    }
    (out_dir / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n")


# ---------------------------------------------------------------- journey times
def _dedup(*parts: object) -> str:
    return hashlib.sha256("|".join(str(p) for p in parts).encode()).hexdigest()[:40]


def _insert_journey(session: Session, values: dict) -> bool:
    """True if inserted, False if a record with the same dedup_key already exists."""
    stmt = (
        insert(JourneyObservation)
        .values(**values)
        .on_conflict_do_nothing(index_elements=[JourneyObservation.dedup_key])
        .returning(JourneyObservation.id)
    )
    return session.execute(stmt).scalar() is not None


def collect_osrm_journeys(session: Session, settings: Settings, providers: Providers) -> RunStats:
    """Daily free-flow baseline for each OD pair (ESTIMATED, not traffic-aware, not ML-eligible).
    One record per pair per UTC day; re-runs on the same day are counted as duplicates."""
    seed_sources(session)
    sync_od_pairs(session, settings)
    with ingestion_run(session, "collect-osrm-journeys", "osrm") as stats:
        for p in load_od_pairs(settings.reference_dir):
            try:
                est = call_logged(session, "osrm", lambda: providers.osrm.route([p.origin, p.destination]))
            except ProviderError as e:
                stats.errors.append(f"{p.id}: {e.kind}")
                continue
            day = est.retrieved_at.date().isoformat()
            ok = _insert_journey(
                session,
                dict(
                    od_pair_id=p.id,
                    source_id="osrm",
                    kind=DataKind.ESTIMATED.value,
                    traffic_aware=False,
                    ml_eligible=False,
                    departure_at=est.retrieved_at,
                    retrieved_at=est.retrieved_at,
                    duration_s=est.duration_s,
                    distance_m=est.distance_m,
                    dedup_key=_dedup("osrm", p.id, day),
                    meta={"notes": est.notes},
                ),
            )
            stats.inserted += int(ok)
            stats.duplicates += int(not ok)
        session.commit()
    return stats


def collect_weather(session: Session, settings: Settings, providers: Providers) -> RunStats:
    seed_sources(session)
    with ingestion_run(session, "collect-weather", "open-meteo") as stats:
        try:
            w = call_logged(session, "open-meteo", lambda: providers.weather.current(*MUMBAI_WEATHER_POINT))
        except ProviderError as e:
            stats.errors.append(e.kind + ": " + e.message[:200])
            return stats
        if w.valid_at > utcnow() + timedelta(hours=1):
            stats.invalid += 1
            stats.errors.append("valid_at is in the future")
            return stats
        stmt = insert(WeatherObservation).values(
            source_id="open-meteo",
            kind=w.kind.value,
            valid_at=w.valid_at,
            retrieved_at=w.retrieved_at,
            lat=w.lat,
            lon=w.lon,
            temperature_c=w.temperature_c,
            precipitation_mm=w.precipitation_mm,
            rain_mm=w.rain_mm,
            weather_code=w.weather_code,
            wind_speed_kmh=w.wind_speed_kmh,
            dedup_key=_dedup("open-meteo", w.valid_at.isoformat(), round(w.lat, 3), round(w.lon, 3)),
        ).on_conflict_do_nothing(index_elements=[WeatherObservation.dedup_key]).returning(WeatherObservation.id)
        ok = session.execute(stmt).scalar() is not None
        session.commit()
        stats.inserted += int(ok)
        stats.duplicates += int(not ok)
    return stats


# ---------------------------------------------------------------- operator trip-time CSV (OBSERVED, ML-eligible)
CSV_FIELDS = ("od_pair_id", "departure_at", "duration_s")


def import_operator_csv(session: Session, settings: Settings, path: Path) -> RunStats:
    """Columns: od_pair_id, departure_at (ISO-8601 with offset), duration_s, [distance_m], [vehicle_ref].
    Invalid rows are counted and reported, never silently fixed."""
    seed_sources(session)
    sync_od_pairs(session, settings)
    known = set(session.scalars(select(OdPair.id)))
    with ingestion_run(session, "import-operator-csv", "operator-upload") as stats:
        stats.details = {"file": path.name, "invalid_rows": []}
        with path.open(newline="", encoding="utf-8") as fh:
            reader = csv.DictReader(fh)
            missing = [c for c in CSV_FIELDS if c not in (reader.fieldnames or [])]
            if missing:
                raise ValueError(f"CSV is missing columns: {', '.join(missing)}")
            now = utcnow()
            for i, row in enumerate(reader, start=2):
                try:
                    od = (row.get("od_pair_id") or "").strip()
                    if od not in known:
                        raise ValueError(f"unknown od_pair_id {od!r}")
                    dep = ensure_utc(datetime.fromisoformat((row.get("departure_at") or "").strip()))
                    if dep > now:
                        raise ValueError("departure_at is in the future")
                    dur = float(row["duration_s"])
                    if not (60 <= dur <= 4 * 3600):
                        raise ValueError("duration_s outside 60..14400")
                    dist = float(row["distance_m"]) if (row.get("distance_m") or "").strip() else None
                    veh = (row.get("vehicle_ref") or "").strip() or None
                except (ValueError, KeyError) as e:
                    stats.invalid += 1
                    if len(stats.details["invalid_rows"]) < 50:
                        stats.details["invalid_rows"].append({"line": i, "error": str(e)})
                    continue
                ok = _insert_journey(
                    session,
                    dict(
                        od_pair_id=od,
                        source_id="operator-upload",
                        kind=DataKind.OBSERVED.value,
                        traffic_aware=True,
                        ml_eligible=True,
                        departure_at=dep,
                        retrieved_at=now,
                        duration_s=dur,
                        distance_m=dist,
                        vehicle_ref=veh,
                        dedup_key=_dedup("operator", od, dep.isoformat(), veh or ""),
                        meta={"file": path.name},
                    ),
                )
                stats.inserted += int(ok)
                stats.duplicates += int(not ok)
        session.commit()
        if stats.invalid and not stats.inserted and not stats.duplicates:
            stats.errors.append("no valid rows")
    return stats
