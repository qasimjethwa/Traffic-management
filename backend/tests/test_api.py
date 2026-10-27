from datetime import datetime, timedelta, timezone

import pytest
from fastapi.testclient import TestClient

from app import api
from app.config import get_settings
from app.db import get_session
from app.ingest.jobs import collect_osrm_journeys, import_corridors
from app.sources import seed_sources


@pytest.fixture
def client(session, settings, mock_providers):
    api.app.dependency_overrides[get_session] = lambda: session
    api.app.dependency_overrides[api.get_providers] = lambda: mock_providers
    api.app.dependency_overrides[get_settings] = lambda: settings
    seed_sources(session)
    yield TestClient(api.app)
    api.app.dependency_overrides.clear()


def test_health(client):
    r = client.get("/api/health").json()
    assert r["database"] == "ok" and r["time_utc"].endswith("Z")


def test_sources_report_configuration_and_freshness(client, session, settings, mock_providers):
    collect_osrm_journeys(session, settings, mock_providers)
    src = {s["id"]: s for s in client.get("/api/sources").json()["sources"]}
    assert src["osrm"]["health"] == "ok" and src["osrm"]["freshness"] == "fresh"
    assert src["google-routes"]["configured"] is False and src["google-routes"]["health"] == "not_configured"
    assert src["google-routes"]["freshness"] == "not_stored"
    assert src["open-meteo"]["freshness"] == "unavailable"
    assert all(s["kind"] != "SIMULATED" for s in src.values())


def test_corridors_geojson(client, session, settings, mock_providers):
    import_corridors(session, settings, mock_providers, write_snapshot=False)
    fc = client.get("/api/corridors").json()
    assert len(fc["features"]) == 9 and fc["features"][0]["geometry"]["type"] == "LineString"
    assert fc["features"][0]["properties"]["provenance"]["kind"] == "ESTIMATED"


def test_journey_summary_and_observations(client, session, settings, mock_providers):
    collect_osrm_journeys(session, settings, mock_providers)
    summ = client.get("/api/journeys/summary").json()["od_pairs"]
    osrm = next(s for s in summ[0]["sources"] if s["source"] == "osrm")
    assert osrm["count"] == 1 and osrm["latest"]["kind"] == "ESTIMATED" and osrm["latest"]["traffic_aware"] is False
    op = next(s for s in summ[0]["sources"] if s["source"] == "operator-upload")
    assert op["count"] == 0 and op["freshness"] == "unavailable"
    obs = client.get("/api/journeys/observations", params={"od_pair_id": "bandra-bkc"}).json()["observations"]
    assert len(obs) == 1


def test_estimate_osrm_and_google_not_configured(client, session, settings, mock_providers):
    collect_osrm_journeys(session, settings, mock_providers)  # seeds OD pairs
    r = client.post("/api/journeys/estimate", json={"od_pair_id": "andheri-powai"})
    assert r.status_code == 200 and r.json()["kind"] == "ESTIMATED" and r.json()["stored"] is False
    g = client.post("/api/journeys/estimate", json={"od_pair_id": "andheri-powai", "provider": "google-routes"})
    assert g.status_code == 503 and g.json()["error"] == "not_configured"
    assert client.post("/api/journeys/estimate", json={"od_pair_id": "nope"}).status_code == 404


def test_google_estimate_respects_terms_and_caps(client, session, settings, mock_providers):
    collect_osrm_journeys(session, settings, mock_providers)
    mock_providers.google.api_key = "test-key"
    settings.google_routes_per_minute_cap = 1
    r = client.post("/api/journeys/estimate", json={"od_pair_id": "andheri-powai", "provider": "google-routes"}).json()
    assert r["traffic_aware"] and r["stored"] is False and r["map_display_allowed"] is False and r["geometry"] is None
    again = client.post("/api/journeys/estimate", json={"od_pair_id": "andheri-powai", "provider": "google-routes"})
    assert again.status_code == 429 and again.json()["error"] == "rate_limited"
    from sqlalchemy import select, text

    from app.models import JourneyObservation

    assert session.scalar(select(text("count(*)")).select_from(JourneyObservation).where(JourneyObservation.source_id == "google-routes")) == 0


def test_osrm_outage_returns_structured_error(client, session, settings, mock_providers):
    collect_osrm_journeys(session, settings, mock_providers)
    mock_providers.state["fail"] = {"osrm"}
    r = client.post("/api/journeys/estimate", json={"od_pair_id": "andheri-powai"})
    assert r.status_code == 502 and r.json()["error"] == "http_error"


def test_forecast_unavailable_without_model(client):
    s = client.get("/api/forecast/status").json()
    assert s["status"] == "unavailable"
    r = client.get("/api/forecast/journey", params={"od_pair_id": "bandra-bkc", "departure_at": "2026-10-27T10:00:00+05:30"})
    assert r.status_code == 503


def test_operator_actions_roundtrip(client):
    r = client.post("/api/operator-actions", json={"incident_ref": "INC-2041", "incident_kind": "SIMULATED", "action": "resolve"})
    assert r.status_code == 201
    assert client.post("/api/operator-actions", json={"incident_ref": "x", "incident_kind": "REAL", "action": "resolve"}).status_code == 422
    acts = client.get("/api/operator-actions", params={"incident_ref": "INC-2041"}).json()["actions"]
    assert acts[0]["incident_kind"] == "SIMULATED" and acts[0]["created_at"].endswith("Z")


def test_weather_unavailable_state(client):
    assert client.get("/api/weather/latest").json() == {"available": False, "freshness": "unavailable", "reason": "no weather has been ingested yet"}


def test_database_down_returns_503(session, settings):
    from sqlalchemy import create_engine
    from sqlalchemy.orm import sessionmaker

    bad = sessionmaker(bind=create_engine("postgresql+psycopg://nobody:x@127.0.0.1:1/none"))()
    api.app.dependency_overrides[get_session] = lambda: bad
    try:
        r = TestClient(api.app).get("/api/ingestion/runs")
        assert r.status_code == 503 and r.json()["error"] == "database_unavailable"
    finally:
        api.app.dependency_overrides.clear()
