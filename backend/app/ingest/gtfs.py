"""GTFS static importer with validation.

Imports agency/routes/stops (+ feed_info or calendar dates) from a local zip. Schedules describe planned service,
not live vehicle positions, and are never presented as tracking data.
"""
from __future__ import annotations

import csv
import hashlib
import io
import zipfile
from datetime import date, datetime
from pathlib import Path

from sqlalchemy import select
from sqlalchemy.orm import Session

from ..models import GtfsFeed, GtfsRoute, GtfsStop
from ..provenance import in_mmr, utcnow
from ..sources import seed_sources
from .runs import RunStats, ingestion_run

REQUIRED = ("agency.txt", "routes.txt", "stops.txt", "trips.txt", "stop_times.txt")


class GtfsError(ValueError):
    pass


def _read(zf: zipfile.ZipFile, name: str) -> list[dict]:
    with zf.open(name) as fh:
        return list(csv.DictReader(io.TextIOWrapper(fh, encoding="utf-8-sig")))


def _gtfs_date(s: str | None) -> date | None:
    if not s:
        return None
    return datetime.strptime(s.strip(), "%Y%m%d").date()


def parse_feed(path: Path) -> dict:
    data = path.read_bytes()
    sha = hashlib.sha256(data).hexdigest()
    try:
        zf = zipfile.ZipFile(io.BytesIO(data))
    except zipfile.BadZipFile as e:
        raise GtfsError("not a zip file") from e
    names = set(zf.namelist())
    missing = [f for f in REQUIRED if f not in names]
    if missing:
        raise GtfsError(f"missing required files: {', '.join(missing)}")
    if "calendar.txt" not in names and "calendar_dates.txt" not in names:
        raise GtfsError("missing calendar.txt or calendar_dates.txt")

    warnings: list[str] = []
    agency = _read(zf, "agency.txt")
    routes, stops = [], []
    seen_routes: set[str] = set()
    for r in _read(zf, "routes.txt"):
        rid = (r.get("route_id") or "").strip()
        if not rid or rid in seen_routes:
            warnings.append(f"route skipped: empty or duplicate route_id {rid!r}")
            continue
        seen_routes.add(rid)
        try:
            rtype = int(r.get("route_type", ""))
        except ValueError:
            warnings.append(f"route {rid}: invalid route_type")
            continue
        routes.append({"route_id": rid, "short_name": r.get("route_short_name") or None, "long_name": r.get("route_long_name") or None, "route_type": rtype})

    seen_stops: set[str] = set()
    outside = 0
    for s in _read(zf, "stops.txt"):
        sid = (s.get("stop_id") or "").strip()
        if not sid or sid in seen_stops:
            warnings.append(f"stop skipped: empty or duplicate stop_id {sid!r}")
            continue
        try:
            lat, lon = float(s["stop_lat"]), float(s["stop_lon"])
        except (KeyError, ValueError):
            warnings.append(f"stop {sid}: invalid coordinates")
            continue
        if not (-90 <= lat <= 90 and -180 <= lon <= 180):
            warnings.append(f"stop {sid}: coordinates out of range")
            continue
        if not in_mmr(lat, lon):
            outside += 1
            continue
        seen_stops.add(sid)
        stops.append({"stop_id": sid, "name": (s.get("stop_name") or sid)[:200], "lat": lat, "lon": lon})
    if outside:
        warnings.append(f"{outside} stops outside the Mumbai Metropolitan Region were not imported")

    start = end = None
    if "feed_info.txt" in names:
        fi = _read(zf, "feed_info.txt")
        if fi:
            start, end = _gtfs_date(fi[0].get("feed_start_date")), _gtfs_date(fi[0].get("feed_end_date"))
    if start is None and "calendar.txt" in names:
        cal = _read(zf, "calendar.txt")
        starts = [_gtfs_date(c.get("start_date")) for c in cal if c.get("start_date")]
        ends = [_gtfs_date(c.get("end_date")) for c in cal if c.get("end_date")]
        start, end = (min(starts) if starts else None), (max(ends) if ends else None)
    if end and end < utcnow().date():
        warnings.append(f"feed expired on {end.isoformat()}: service dates are historical")
    if not stops:
        raise GtfsError("no stops inside the Mumbai Metropolitan Region — not a Mumbai feed")
    return {
        "sha256": sha,
        "agency_name": (agency[0].get("agency_name") if agency else None),
        "start": start,
        "end": end,
        "routes": routes,
        "stops": stops,
        "warnings": warnings,
    }


def import_gtfs(session: Session, path: Path, source_url: str, license: str) -> RunStats:
    if not license.strip():
        raise GtfsError("a licence must be recorded for every imported feed")
    seed_sources(session)
    with ingestion_run(session, "import-gtfs", "gtfs") as stats:
        feed = parse_feed(path)
        if session.scalar(select(GtfsFeed.id).where(GtfsFeed.sha256 == feed["sha256"])):
            stats.duplicates = 1
            stats.details = {"sha256": feed["sha256"], "note": "feed already imported"}
            return stats
        row = GtfsFeed(
            source_url=source_url,
            license=license,
            sha256=feed["sha256"],
            agency_name=feed["agency_name"],
            feed_start_date=feed["start"],
            feed_end_date=feed["end"],
            imported_at=utcnow(),
            stops_count=len(feed["stops"]),
            routes_count=len(feed["routes"]),
            warnings=feed["warnings"][:200],
        )
        session.add(row)
        session.flush()
        session.add_all(GtfsRoute(feed_id=row.id, **r) for r in feed["routes"])
        session.add_all(
            GtfsStop(feed_id=row.id, stop_id=s["stop_id"], name=s["name"], geom=f"SRID=4326;POINT({s['lon']} {s['lat']})")
            for s in feed["stops"]
        )
        session.commit()
        stats.inserted = len(feed["stops"]) + len(feed["routes"])
        stats.details = {"feed_id": row.id, "stops": len(feed["stops"]), "routes": len(feed["routes"]), "warnings": len(feed["warnings"])}
    return stats
