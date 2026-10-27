import io
import json
import zipfile
from datetime import datetime, timedelta, timezone

import pytest
from sqlalchemy import select, text
from sqlalchemy.exc import IntegrityError

from app.ingest.gtfs import GtfsError, import_gtfs, parse_feed
from app.ingest.jobs import collect_osrm_journeys, collect_weather, import_corridors, import_operator_csv
from app.models import Corridor, IngestionRun, JourneyObservation, ProviderRequest, WeatherObservation


def test_corridor_import_writes_db_and_snapshot(session, settings, mock_providers):
    stats = import_corridors(session, settings, mock_providers)
    assert stats.inserted == 9 and stats.invalid == 0
    assert session.scalar(select(text("count(*)")).select_from(Corridor)) == 9
    manifest = json.loads((settings.static_snapshot_dir / "manifest.json").read_text())
    ds = manifest["datasets"][0]
    assert ds["kind"] == "ESTIMATED" and ds["source"] == "osrm" and ds["records"] == 9 and "OpenStreetMap" in ds["license"]
    gj = json.loads((settings.static_snapshot_dir / "corridors.geojson").read_text())
    assert all(f["properties"]["provenance"]["retrievedAt"].endswith("Z") for f in gj["features"])
    run = session.scalars(select(IngestionRun)).one()
    assert run.status == "success" and run.inserted == 9


def test_osrm_journeys_dedup_per_day(session, settings, mock_providers):
    a = collect_osrm_journeys(session, settings, mock_providers)
    b = collect_osrm_journeys(session, settings, mock_providers)
    assert (a.inserted, a.duplicates) == (6, 0)
    assert (b.inserted, b.duplicates) == (0, 6)
    rows = session.scalars(select(JourneyObservation)).all()
    assert all(r.kind == "ESTIMATED" and not r.traffic_aware and not r.ml_eligible for r in rows)
    assert session.scalar(select(text("count(*)")).select_from(ProviderRequest)) == 12


def test_provider_outage_is_logged_not_fabricated(session, settings, mock_providers):
    mock_providers.state["fail"] = {"osrm", "weather"}
    j = collect_osrm_journeys(session, settings, mock_providers)
    w = collect_weather(session, settings, mock_providers)
    assert j.inserted == 0 and len(j.errors) == 6
    assert w.inserted == 0 and "rate_limited" in w.errors[0]
    assert session.scalar(select(text("count(*)")).select_from(JourneyObservation)) == 0
    assert session.scalar(select(text("count(*)")).select_from(WeatherObservation)) == 0
    statuses = [r.status for r in session.scalars(select(IngestionRun))]
    assert statuses == ["failed", "failed"]


def test_weather_ingest_and_dedup(session, settings, mock_providers):
    assert collect_weather(session, settings, mock_providers).inserted == 1
    assert collect_weather(session, settings, mock_providers).duplicates == 1
    w = session.scalars(select(WeatherObservation)).one()
    assert w.kind == "ESTIMATED" and w.valid_at == datetime(2026, 10, 27, 10, tzinfo=timezone.utc)


def test_database_rejects_simulated_values(session, settings, mock_providers):
    collect_osrm_journeys(session, settings, mock_providers)
    with pytest.raises(IntegrityError):
        session.execute(text("UPDATE journey_observations SET kind='SIMULATED'"))
        session.commit()
    session.rollback()


def _csv(tmp_path, rows):
    p = tmp_path / "trips.csv"
    p.write_text("od_pair_id,departure_at,duration_s,distance_m,vehicle_ref\n" + "\n".join(rows) + "\n")
    return p


def test_operator_csv_validation(session, settings, tmp_path):
    past = (datetime.now(timezone.utc) - timedelta(days=1)).isoformat()
    future = (datetime.now(timezone.utc) + timedelta(days=1)).isoformat()
    p = _csv(tmp_path, [
        f"bandra-bkc,{past},1260,6100,BUS-1",
        f"bandra-bkc,{past},1260,6100,BUS-1",  # duplicate
        "bandra-bkc,2026-10-20T08:00:00,1200,,",  # naive timestamp
        f"nowhere,{past},1200,,",  # unknown pair
        f"bandra-bkc,{future},1200,,",  # future
        f"bandra-bkc,{past},5,,BUS-2",  # implausible duration
    ])
    s = import_operator_csv(session, settings, p)
    assert (s.inserted, s.duplicates, s.invalid) == (1, 1, 4)
    errors = [r["error"] for r in s.details["invalid_rows"]]
    assert any("timezone" in e for e in errors) and any("unknown" in e for e in errors) and any("future" in e for e in errors)
    obs = session.scalars(select(JourneyObservation)).one()
    assert obs.kind == "OBSERVED" and obs.ml_eligible and obs.source_id == "operator-upload"


def test_operator_csv_missing_columns_fails_run(session, settings, tmp_path):
    p = tmp_path / "bad.csv"
    p.write_text("foo,bar\n1,2\n")
    with pytest.raises(ValueError):
        import_operator_csv(session, settings, p)
    assert session.scalars(select(IngestionRun)).one().status == "failed"


def make_gtfs(tmp_path, stops, end="20991231", name="feed.zip", drop=None):
    files = {
        "agency.txt": "agency_id,agency_name,agency_url,agency_timezone\nA,Test Agency,https://example.test,Asia/Kolkata\n",
        "routes.txt": "route_id,route_short_name,route_long_name,route_type\nR1,1,Test route,3\nR1,1,dup,3\n",
        "stops.txt": "stop_id,stop_name,stop_lat,stop_lon\n" + "".join(f"{i},{n},{la},{lo}\n" for i, n, la, lo in stops),
        "trips.txt": "route_id,service_id,trip_id\nR1,S,T1\n",
        "stop_times.txt": "trip_id,arrival_time,departure_time,stop_id,stop_sequence\nT1,08:00:00,08:00:00,s1,1\n",
        "calendar.txt": f"service_id,monday,tuesday,wednesday,thursday,friday,saturday,sunday,start_date,end_date\nS,1,1,1,1,1,0,0,20260101,{end}\n",
    }
    if drop:
        files.pop(drop)
    p = tmp_path / name
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w") as z:
        for k, v in files.items():
            z.writestr(k, v)
    p.write_bytes(buf.getvalue())
    return p


def test_gtfs_validation_and_import(session, tmp_path):
    # test fixture only: two stops in Mumbai, one in Delhi
    p = make_gtfs(tmp_path, [("s1", "Fixture stop A", 19.0596, 72.8295), ("s2", "Fixture stop B", 19.066, 72.8679), ("s3", "Delhi", 28.61, 77.21)])
    feed = parse_feed(p)
    assert len(feed["stops"]) == 2 and len(feed["routes"]) == 1
    assert any("outside" in w for w in feed["warnings"]) and any("duplicate route_id" in w for w in feed["warnings"])
    s = import_gtfs(session, p, "https://example.test/feed.zip", "CC-BY-4.0")
    assert s.inserted == 3
    again = import_gtfs(session, p, "https://example.test/feed.zip", "CC-BY-4.0")
    assert again.duplicates == 1 and again.inserted == 0


def test_gtfs_rejects_non_mumbai_and_incomplete(tmp_path):
    with pytest.raises(GtfsError, match="Mumbai"):
        parse_feed(make_gtfs(tmp_path, [("s1", "Delhi", 28.61, 77.21)], name="delhi.zip"))
    with pytest.raises(GtfsError, match="missing required"):
        parse_feed(make_gtfs(tmp_path, [("s1", "A", 19.06, 72.83)], drop="stops.txt", name="nostops.zip"))
    expired = parse_feed(make_gtfs(tmp_path, [("s1", "A", 19.06, 72.83)], end="20240101", name="old.zip"))
    assert any("expired" in w for w in expired["warnings"])
