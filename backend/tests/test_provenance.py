from datetime import datetime, timedelta, timezone

import pytest

from app.provenance import Freshness, ensure_utc, freshness, in_mmr, iso_utc, to_ist_str


def test_freshness_states():
    now = datetime(2026, 10, 27, 12, tzinfo=timezone.utc)
    assert freshness(None, 60, now) is Freshness.UNAVAILABLE
    assert freshness(now - timedelta(seconds=30), 60, now) is Freshness.FRESH
    assert freshness(now - timedelta(seconds=61), 60, now) is Freshness.STALE
    assert freshness(now, None, now) is Freshness.UNKNOWN


def test_naive_timestamps_rejected():
    with pytest.raises(ValueError):
        ensure_utc(datetime(2026, 1, 1))


def test_ist_display_and_utc_iso():
    dt = datetime(2026, 10, 27, 15, 15, tzinfo=timezone.utc)
    assert to_ist_str(dt) == "27 Oct 2026 20:45 IST"
    assert iso_utc(dt) == "2026-10-27T15:15:00Z"


def test_mmr_bbox():
    assert in_mmr(19.076, 72.8777)
    assert not in_mmr(28.61, 77.21)  # Delhi
