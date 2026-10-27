"""Test configuration. DB tests use MF_TEST_DATABASE_URL (default: local mumbai_flow_test) and are skipped if it is unreachable."""
from __future__ import annotations

import os

TEST_DB = os.environ.get("MF_TEST_DATABASE_URL", "postgresql+psycopg://mumbai_flow:mumbai_flow@localhost:5432/mumbai_flow_test")
os.environ["MF_DATABASE_URL"] = TEST_DB

import httpx  # noqa: E402
import pytest  # noqa: E402
from sqlalchemy import create_engine, text  # noqa: E402
from sqlalchemy.exc import OperationalError  # noqa: E402

from app.config import Settings  # noqa: E402
from app.providers import build_providers  # noqa: E402

TABLES = "journey_observations, weather_observations, ingestion_runs, provider_requests, operator_actions, gtfs_stops, gtfs_routes, gtfs_feeds, corridors, od_pairs, data_sources"


@pytest.fixture(scope="session")
def engine():
    eng = create_engine(TEST_DB)
    try:
        with eng.connect() as c:
            c.execute(text("SELECT 1"))
    except OperationalError:
        pytest.skip("test database not reachable")
    from alembic import command
    from alembic.config import Config

    cfg = Config(os.path.join(os.path.dirname(__file__), "..", "alembic.ini"))
    cfg.set_main_option("script_location", os.path.join(os.path.dirname(__file__), "..", "migrations"))
    cfg.set_main_option("sqlalchemy.url", TEST_DB)
    command.upgrade(cfg, "head")
    return eng


@pytest.fixture
def session(engine):
    from sqlalchemy.orm import sessionmaker

    with engine.begin() as c:
        c.execute(text(f"TRUNCATE {TABLES} RESTART IDENTITY CASCADE"))
    s = sessionmaker(bind=engine, expire_on_commit=False)()
    yield s
    s.close()


@pytest.fixture
def settings(tmp_path):
    return Settings(database_url=TEST_DB, static_snapshot_dir=tmp_path / "snapshot", ml_artifacts_dir=tmp_path / "ml", http_retries=1, http_backoff_s=0)


def osrm_payload(coords, duration=600.0, distance=5000.0):
    return {"code": "Ok", "routes": [{"duration": duration, "distance": distance, "geometry": {"type": "LineString", "coordinates": [[lon, lat] for lat, lon in coords]}}]}


@pytest.fixture
def mock_providers(settings):
    """Providers backed by an httpx MockTransport. OSRM returns a straight line through the requested points."""
    calls = {"osrm": 0, "google": 0, "weather": 0}
    state = {"fail": set()}

    def handler(req: httpx.Request) -> httpx.Response:
        host = req.url.host
        if "osrm" in host or "router" in host:
            calls["osrm"] += 1
            if "osrm" in state["fail"]:
                return httpx.Response(503, text="down")
            path = req.url.path.split("/driving/")[1]
            pts = [tuple(map(float, p.split(",")))[::-1] for p in path.split(";")]
            from app.ingest.jobs import _polyline_km

            km = _polyline_km(pts)
            return httpx.Response(200, json=osrm_payload(pts, duration=km / 30 * 3600, distance=km * 1000))
        if "googleapis" in host:
            calls["google"] += 1
            return httpx.Response(200, json={"routes": [{"duration": "1500s", "staticDuration": "1200s", "distanceMeters": 9000}]})
        if "open-meteo" in host:
            calls["weather"] += 1
            if "weather" in state["fail"]:
                return httpx.Response(429, json={"error": True, "reason": "Daily API request limit exceeded"})
            return httpx.Response(200, json={"latitude": 19.07, "longitude": 72.88, "utc_offset_seconds": 0, "current": {"time": "2026-10-27T10:00", "interval": 900, "temperature_2m": 30.5, "precipitation": 0.2, "rain": 0.2, "weather_code": 61, "wind_speed_10m": 12.0}})
        return httpx.Response(404)

    p = build_providers(settings, transport=httpx.MockTransport(handler))
    p.calls = calls
    p.state = state
    return p
