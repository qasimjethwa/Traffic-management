"""Command-line entry points for ingestion and ML. Run from backend/: python -m app.cli <command>."""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from sqlalchemy import select

from .config import get_settings
from .db import make_sessionmaker
from .ingest.gtfs import import_gtfs
from .ingest.jobs import collect_osrm_journeys, collect_weather, import_corridors, import_operator_csv, sync_od_pairs
from .ingest.runs import RunStats
from .ml.dataset import load_eligible
from .ml.forecast import train_and_evaluate
from .models import IngestionRun
from .provenance import to_ist_str
from .providers import ProviderError, build_providers
from .sources import seed_sources


def _print(stats: RunStats) -> int:
    print(json.dumps({"inserted": stats.inserted, "duplicates": stats.duplicates, "invalid": stats.invalid, "errors": stats.errors, "skipped": stats.skipped_reason, "details": stats.details}, indent=2, default=str))
    return 1 if stats.errors and not (stats.inserted or stats.duplicates) else 0


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(prog="python -m app.cli")
    sub = ap.add_subparsers(dest="cmd", required=True)
    sub.add_parser("seed", help="seed data sources and OD pairs")
    c = sub.add_parser("import-corridors", help="snap corridors to OSM roads via OSRM; store + write static snapshot")
    c.add_argument("--snapshot-only", action="store_true", help="write public/data/real without touching the database")
    sub.add_parser("collect-journeys", help="daily OSRM free-flow journey times for every OD pair")
    sub.add_parser("collect-weather", help="current Mumbai weather from Open-Meteo")
    o = sub.add_parser("import-observations", help="import operator-recorded trip times (CSV)")
    o.add_argument("csv", type=Path)
    g = sub.add_parser("import-gtfs", help="import a GTFS static zip")
    g.add_argument("zip", type=Path)
    g.add_argument("--source-url", required=True)
    g.add_argument("--license", required=True)
    r = sub.add_parser("runs", help="show recent ingestion runs")
    r.add_argument("--limit", type=int, default=20)
    sub.add_parser("train", help="train + evaluate the journey-time forecaster (or report insufficient data)")
    args = ap.parse_args(argv)

    settings = get_settings()
    providers = build_providers(settings)

    if args.cmd == "import-corridors" and args.snapshot_only:
        return _print(import_corridors(None, settings, providers))

    session = make_sessionmaker()()
    try:
        if args.cmd == "seed":
            seed_sources(session)
            print(f"seeded sources and {sync_od_pairs(session, settings)} OD pairs")
            return 0
        if args.cmd == "import-corridors":
            return _print(import_corridors(session, settings, providers))
        if args.cmd == "collect-journeys":
            return _print(collect_osrm_journeys(session, settings, providers))
        if args.cmd == "collect-weather":
            return _print(collect_weather(session, settings, providers))
        if args.cmd == "import-observations":
            return _print(import_operator_csv(session, settings, args.csv))
        if args.cmd == "import-gtfs":
            return _print(import_gtfs(session, args.zip, args.source_url, args.license))
        if args.cmd == "runs":
            for run in session.scalars(select(IngestionRun).order_by(IngestionRun.started_at.desc()).limit(args.limit)):
                print(f"{to_ist_str(run.started_at):>22}  {run.job:<24} {run.status:<8} +{run.inserted} dup={run.duplicates} invalid={run.invalid}  {run.error or ''}")
            return 0
        if args.cmd == "train":
            result = train_and_evaluate(load_eligible(session), settings.ml_artifacts_dir)
            print(json.dumps(result, indent=2))
            return 0
    except ProviderError as e:
        print(f"provider error: {e}", file=sys.stderr)
        return 2
    finally:
        session.close()
    return 1


if __name__ == "__main__":
    sys.exit(main())
