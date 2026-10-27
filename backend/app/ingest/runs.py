"""Ingestion-run bookkeeping and provider request logging."""
from __future__ import annotations

import time
from contextlib import contextmanager
from dataclasses import dataclass, field
from datetime import timedelta

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..models import IngestionRun, ProviderRequest
from ..provenance import utcnow
from ..providers.http import ProviderError


@dataclass
class RunStats:
    inserted: int = 0
    duplicates: int = 0
    invalid: int = 0
    errors: list[str] = field(default_factory=list)
    details: dict = field(default_factory=dict)
    skipped_reason: str | None = None


@contextmanager
def ingestion_run(session: Session, job: str, source_id: str | None):
    """Records a run row. Status: success / partial (some errors) / failed (exception or nothing worked) / skipped."""
    run = IngestionRun(job=job, source_id=source_id, started_at=utcnow(), status="running")
    session.add(run)
    session.commit()
    stats = RunStats()
    try:
        yield stats
    except Exception as e:  # recorded, then re-raised for the caller/CLI
        session.rollback()
        run = session.get(IngestionRun, run.id)
        run.status = "failed"
        run.error = f"{e.__class__.__name__}: {e}"[:2000]
        _finish(session, run, stats)
        raise
    if stats.skipped_reason:
        run.status = "skipped"
        run.error = stats.skipped_reason
    elif stats.errors and stats.inserted == 0 and stats.duplicates == 0:
        run.status = "failed"
        run.error = "; ".join(stats.errors)[:2000]
    elif stats.errors:
        run.status = "partial"
        run.error = "; ".join(stats.errors)[:2000]
    else:
        run.status = "success"
    _finish(session, run, stats)


def _finish(session: Session, run: IngestionRun, stats: RunStats) -> None:
    run.finished_at = utcnow()
    run.inserted, run.duplicates, run.invalid = stats.inserted, stats.duplicates, stats.invalid
    run.details = stats.details or None
    session.add(run)
    session.commit()


def log_request(session: Session, provider: str, ok: bool, error_kind: str | None, started: float) -> None:
    session.add(
        ProviderRequest(
            provider=provider,
            requested_at=utcnow(),
            ok=ok,
            error_kind=error_kind,
            latency_ms=int((time.monotonic() - started) * 1000),
        )
    )
    session.commit()


def call_logged(session: Session, provider: str, fn):
    started = time.monotonic()
    try:
        result = fn()
    except ProviderError as e:
        if e.kind != "not_configured":
            log_request(session, provider, False, e.kind, started)
        raise
    log_request(session, provider, True, None, started)
    return result


def requests_since(session: Session, provider: str, seconds: int) -> int:
    since = utcnow() - timedelta(seconds=seconds)
    return session.scalar(
        select(func.count()).select_from(ProviderRequest).where(ProviderRequest.provider == provider, ProviderRequest.requested_at >= since)
    ) or 0
