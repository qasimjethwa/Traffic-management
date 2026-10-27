"""FastAPI application. Run: uvicorn app.api:app --reload (from backend/)."""
from __future__ import annotations

import json
import logging
from datetime import datetime
from typing import Literal

from fastapi import Depends, FastAPI, HTTPException, Query, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from geoalchemy2.functions import ST_AsGeoJSON, ST_X, ST_Y
from pydantic import BaseModel, Field
from sqlalchemy import func, select, text
from sqlalchemy.exc import OperationalError, SQLAlchemyError
from sqlalchemy.orm import Session

from .config import Settings, get_settings
from .db import get_session
from .ingest.runs import call_logged, requests_since
from .ml.forecast import forecast_status, predict
from .models import (
    Corridor,
    DataSource,
    GtfsFeed,
    IngestionRun,
    JourneyObservation,
    OdPair,
    OperatorAction,
    ProviderRequest,
    WeatherObservation,
)
from .provenance import ensure_utc, freshness, iso_utc, utcnow
from .providers import Providers, ProviderError, build_providers
from .providers.base import Point

log = logging.getLogger("mumbai_flow")

app = FastAPI(title="Mumbai Flow API", version="1.0.0", description="Real-data API for Mumbai Flow. No simulated values are served.")
app.add_middleware(
    CORSMiddleware,
    allow_origins=get_settings().cors_origin_list,
    allow_methods=["GET", "POST"],
    allow_headers=["Content-Type"],
)

_providers: Providers | None = None


def get_providers() -> Providers:
    global _providers
    if _providers is None:
        _providers = build_providers(get_settings())
    return _providers


@app.exception_handler(ProviderError)
def _provider_error(_: Request, e: ProviderError):
    code = {"not_configured": 503, "quota_exceeded": 429, "rate_limited": 429}.get(e.kind, 502)
    return JSONResponse(status_code=code, content=e.to_dict())


@app.exception_handler(OperationalError)
def _db_down(_: Request, e: OperationalError):
    log.warning("database unavailable: %s", e)
    return JSONResponse(status_code=503, content={"error": "database_unavailable", "message": "The database is not reachable."})


# ---------------------------------------------------------------- health & sources
@app.get("/api/health")
def health(session: Session = Depends(get_session)):
    try:
        session.execute(text("SELECT 1"))
        db = "ok"
    except SQLAlchemyError:
        db = "unavailable"
    return {"status": "ok" if db == "ok" else "degraded", "database": db, "time_utc": iso_utc(utcnow())}


def _latest_record(session: Session, source_id: str) -> datetime | None:
    if source_id == "osrm":
        return max(
            filter(None, [session.scalar(select(func.max(Corridor.retrieved_at))), session.scalar(select(func.max(JourneyObservation.retrieved_at)).where(JourneyObservation.source_id == "osrm"))]),
            default=None,
        )
    if source_id == "open-meteo":
        return session.scalar(select(func.max(WeatherObservation.valid_at)))
    if source_id == "operator-upload":
        return session.scalar(select(func.max(JourneyObservation.departure_at)).where(JourneyObservation.source_id == "operator-upload"))
    if source_id == "gtfs":
        return session.scalar(select(func.max(GtfsFeed.imported_at)))
    return None


@app.get("/api/sources")
def sources(session: Session = Depends(get_session), providers: Providers = Depends(get_providers)):
    out = []
    now = utcnow()
    for s in session.scalars(select(DataSource).order_by(DataSource.id)):
        last_req = session.execute(
            select(ProviderRequest.requested_at, ProviderRequest.ok, ProviderRequest.error_kind)
            .where(ProviderRequest.provider == s.id)
            .order_by(ProviderRequest.requested_at.desc())
            .limit(1)
        ).first()
        last_run = session.execute(
            select(IngestionRun.finished_at, IngestionRun.status, IngestionRun.error)
            .where(IngestionRun.source_id == s.id)
            .order_by(IngestionRun.started_at.desc())
            .limit(1)
        ).first()
        latest = _latest_record(session, s.id) if s.storable else None
        configured = providers.google.is_configured() if s.id == "google-routes" else True
        if not configured:
            health = "not_configured"
        elif last_req is None:
            health = "unknown"
        else:
            health = "ok" if last_req.ok else f"failing ({last_req.error_kind})"
        out.append(
            {
                "id": s.id,
                "name": s.name,
                "kind": s.kind,
                "license": s.license,
                "attribution": s.attribution,
                "url": s.url,
                "notes": s.notes,
                "storable": s.storable,
                "configured": configured,
                "health": health,
                "last_request_at": iso_utc(last_req.requested_at) if last_req else None,
                "last_run": {"finished_at": iso_utc(last_run.finished_at), "status": last_run.status, "error": last_run.error} if last_run else None,
                "latest_record_at": iso_utc(latest),
                "stale_after_s": s.stale_after_s,
                "freshness": freshness(latest, s.stale_after_s, now).value if s.storable else "not_stored",
            }
        )
    return {"sources": out}


# ---------------------------------------------------------------- corridors & OD pairs
@app.get("/api/corridors")
def corridors(session: Session = Depends(get_session)):
    rows = session.execute(
        select(Corridor, ST_AsGeoJSON(Corridor.geom).label("gj")).order_by(Corridor.id)
    ).all()
    return {
        "type": "FeatureCollection",
        "features": [
            {
                "type": "Feature",
                "geometry": json.loads(gj),
                "properties": {
                    "id": c.id,
                    "name": c.name,
                    "routeCode": c.route_code,
                    "lengthKm": round(c.length_km, 2),
                    "freeFlowDurationS": round(c.free_flow_duration_s),
                    "provenance": {"kind": "ESTIMATED", "source": c.source_id, "retrievedAt": iso_utc(c.retrieved_at)},
                },
            }
            for c, gj in rows
        ],
    }


def _od_pair(session: Session, od_pair_id: str):
    row = session.execute(
        select(OdPair, ST_Y(OdPair.origin), ST_X(OdPair.origin), ST_Y(OdPair.destination), ST_X(OdPair.destination)).where(OdPair.id == od_pair_id)
    ).first()
    if row is None:
        raise HTTPException(404, {"error": "unknown_od_pair", "message": f"no OD pair {od_pair_id!r}"})
    return row


@app.get("/api/od-pairs")
def od_pairs(session: Session = Depends(get_session)):
    rows = session.execute(select(OdPair, ST_Y(OdPair.origin), ST_X(OdPair.origin), ST_Y(OdPair.destination), ST_X(OdPair.destination)).order_by(OdPair.id)).all()
    return {
        "od_pairs": [
            {"id": p.id, "name": p.name, "origin": {"name": p.origin_name, "lat": olat, "lon": olon}, "destination": {"name": p.destination_name, "lat": dlat, "lon": dlon}}
            for p, olat, olon, dlat, dlon in rows
        ]
    }


# ---------------------------------------------------------------- journeys
def _obs_dict(o: JourneyObservation) -> dict:
    return {
        "id": o.id,
        "od_pair_id": o.od_pair_id,
        "source": o.source_id,
        "kind": o.kind,
        "traffic_aware": o.traffic_aware,
        "departure_at": iso_utc(o.departure_at),
        "retrieved_at": iso_utc(o.retrieved_at),
        "duration_s": o.duration_s,
        "distance_m": o.distance_m,
    }


@app.get("/api/journeys/summary")
def journey_summary(session: Session = Depends(get_session)):
    now = utcnow()
    stale = {s.id: s.stale_after_s for s in session.scalars(select(DataSource))}
    out = []
    for p in session.scalars(select(OdPair).order_by(OdPair.id)):
        per_source = []
        for src in ("operator-upload", "osrm"):
            q = select(JourneyObservation).where(JourneyObservation.od_pair_id == p.id, JourneyObservation.source_id == src)
            latest = session.scalars(q.order_by(JourneyObservation.departure_at.desc()).limit(1)).first()
            count = session.scalar(select(func.count()).select_from(q.subquery()))
            per_source.append(
                {
                    "source": src,
                    "count": count,
                    "latest": _obs_dict(latest) if latest else None,
                    "freshness": freshness(latest.departure_at if latest else None, stale.get(src), now).value,
                }
            )
        out.append({"od_pair_id": p.id, "name": p.name, "sources": per_source})
    return {"od_pairs": out}


@app.get("/api/journeys/observations")
def journey_observations(
    od_pair_id: str,
    source: str | None = None,
    limit: int = Query(200, ge=1, le=2000),
    session: Session = Depends(get_session),
):
    q = select(JourneyObservation).where(JourneyObservation.od_pair_id == od_pair_id)
    if source:
        q = q.where(JourneyObservation.source_id == source)
    rows = session.scalars(q.order_by(JourneyObservation.departure_at.desc()).limit(limit)).all()
    return {"observations": [_obs_dict(o) for o in reversed(rows)]}


class EstimateRequest(BaseModel):
    od_pair_id: str
    provider: Literal["osrm", "google-routes"] = "osrm"
    departure_at: datetime | None = None


@app.post("/api/journeys/estimate")
def journey_estimate(
    req: EstimateRequest,
    session: Session = Depends(get_session),
    providers: Providers = Depends(get_providers),
    settings: Settings = Depends(get_settings),
):
    """On-demand estimate. Results are returned, not stored (scheduled jobs handle storage)."""
    p, olat, olon, dlat, dlon = _od_pair(session, req.od_pair_id)
    prov = providers.routing(req.provider)
    if not prov.is_configured():
        raise ProviderError(req.provider, "not_configured", "provider is not configured on this server")
    if req.provider == "google-routes":
        if requests_since(session, "google-routes", 86400) >= settings.google_routes_daily_cap:
            raise ProviderError("google-routes", "quota_exceeded", f"daily cap of {settings.google_routes_daily_cap} requests reached")
        if requests_since(session, "google-routes", 60) >= settings.google_routes_per_minute_cap:
            raise ProviderError("google-routes", "rate_limited", "per-minute cap reached; try again shortly")
    dep = ensure_utc(req.departure_at) if req.departure_at else None
    est = call_logged(session, req.provider, lambda: prov.route([Point(olat, olon), Point(dlat, dlon)], dep))
    return {
        "od_pair_id": p.id,
        "provider": est.provider,
        "kind": est.kind.value,
        "traffic_aware": est.traffic_aware,
        "duration_s": round(est.duration_s, 1),
        "distance_m": est.distance_m,
        "retrieved_at": iso_utc(est.retrieved_at),
        "departure_at": iso_utc(est.departure_at),
        "stored": False,
        "map_display_allowed": est.map_display_allowed,
        "geometry": [[lat, lon] for lat, lon in est.geometry] if est.geometry and est.map_display_allowed else None,
        "static_duration_s": est.extra.get("static_duration_s"),
        "notes": est.notes,
    }


# ---------------------------------------------------------------- weather
@app.get("/api/weather/latest")
def weather_latest(session: Session = Depends(get_session)):
    w = session.scalars(select(WeatherObservation).order_by(WeatherObservation.valid_at.desc()).limit(1)).first()
    stale = session.scalar(select(DataSource.stale_after_s).where(DataSource.id == "open-meteo"))
    if w is None:
        return {"available": False, "freshness": "unavailable", "reason": "no weather has been ingested yet"}
    return {
        "available": True,
        "kind": w.kind,
        "source": w.source_id,
        "valid_at": iso_utc(w.valid_at),
        "retrieved_at": iso_utc(w.retrieved_at),
        "freshness": freshness(w.valid_at, stale).value,
        "temperature_c": w.temperature_c,
        "precipitation_mm": w.precipitation_mm,
        "rain_mm": w.rain_mm,
        "weather_code": w.weather_code,
        "wind_speed_kmh": w.wind_speed_kmh,
    }


# ---------------------------------------------------------------- ingestion
@app.get("/api/ingestion/runs")
def ingestion_runs(limit: int = Query(50, ge=1, le=500), session: Session = Depends(get_session)):
    rows = session.scalars(select(IngestionRun).order_by(IngestionRun.started_at.desc()).limit(limit)).all()
    return {
        "runs": [
            {
                "id": r.id,
                "job": r.job,
                "source": r.source_id,
                "status": r.status,
                "started_at": iso_utc(r.started_at),
                "finished_at": iso_utc(r.finished_at),
                "inserted": r.inserted,
                "duplicates": r.duplicates,
                "invalid": r.invalid,
                "error": r.error,
            }
            for r in rows
        ]
    }


@app.get("/api/ingestion/stats")
def ingestion_stats(session: Session = Depends(get_session), settings: Settings = Depends(get_settings)):
    by_source = session.execute(
        select(JourneyObservation.source_id, JourneyObservation.kind, func.count(), func.min(JourneyObservation.departure_at), func.max(JourneyObservation.departure_at))
        .group_by(JourneyObservation.source_id, JourneyObservation.kind)
    ).all()
    eligible = session.scalar(select(func.count()).select_from(JourneyObservation).where(JourneyObservation.ml_eligible.is_(True))) or 0
    status = forecast_status(settings.ml_artifacts_dir)
    return {
        "journey_observations": [
            {"source": s, "kind": k, "count": n, "first": iso_utc(a), "last": iso_utc(b)} for s, k, n, a, b in by_source
        ],
        "weather_observations": session.scalar(select(func.count()).select_from(WeatherObservation)) or 0,
        "corridors": session.scalar(select(func.count()).select_from(Corridor)) or 0,
        "gtfs_feeds": session.scalar(select(func.count()).select_from(GtfsFeed)) or 0,
        "ml_eligible_observations": eligible,
        "ml_requirements": status.get("requirements"),
    }


# ---------------------------------------------------------------- forecast
@app.get("/api/forecast/status")
def forecast_status_ep(settings: Settings = Depends(get_settings)):
    return forecast_status(settings.ml_artifacts_dir)


@app.get("/api/forecast/journey")
def forecast_journey(od_pair_id: str, departure_at: datetime, settings: Settings = Depends(get_settings)):
    try:
        return predict(settings.ml_artifacts_dir, od_pair_id, ensure_utc(departure_at))
    except LookupError as e:
        raise HTTPException(503, {"error": "forecast_unavailable", "message": str(e)}) from e
    except ValueError as e:
        raise HTTPException(422, {"error": "invalid_request", "message": str(e)}) from e


# ---------------------------------------------------------------- GTFS
@app.get("/api/gtfs/feeds")
def gtfs_feeds(session: Session = Depends(get_session)):
    rows = session.scalars(select(GtfsFeed).order_by(GtfsFeed.imported_at.desc())).all()
    return {
        "feeds": [
            {
                "id": f.id,
                "agency": f.agency_name,
                "source_url": f.source_url,
                "license": f.license,
                "feed_start_date": f.feed_start_date.isoformat() if f.feed_start_date else None,
                "feed_end_date": f.feed_end_date.isoformat() if f.feed_end_date else None,
                "imported_at": iso_utc(f.imported_at),
                "stops": f.stops_count,
                "routes": f.routes_count,
                "warnings": (f.warnings or [])[:20],
            }
            for f in rows
        ]
    }


# ---------------------------------------------------------------- operator actions
class ActionIn(BaseModel):
    incident_ref: str = Field(min_length=1, max_length=64)
    incident_kind: Literal["OBSERVED", "SIMULATED"]
    action: Literal["acknowledge", "resolve", "reopen"]
    note: str | None = Field(default=None, max_length=500)


@app.post("/api/operator-actions", status_code=201)
def create_action(a: ActionIn, session: Session = Depends(get_session)):
    row = OperatorAction(**a.model_dump(), created_at=utcnow())
    session.add(row)
    session.commit()
    return {"id": row.id, **a.model_dump(), "created_at": iso_utc(row.created_at)}


@app.get("/api/operator-actions")
def list_actions(incident_ref: str | None = None, limit: int = Query(100, ge=1, le=1000), session: Session = Depends(get_session)):
    q = select(OperatorAction).order_by(OperatorAction.created_at.desc()).limit(limit)
    if incident_ref:
        q = q.where(OperatorAction.incident_ref == incident_ref)
    return {
        "actions": [
            {"id": r.id, "incident_ref": r.incident_ref, "incident_kind": r.incident_kind, "action": r.action, "note": r.note, "created_at": iso_utc(r.created_at)}
            for r in session.scalars(q)
        ]
    }
