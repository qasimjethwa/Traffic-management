"""ML pipeline tests. The synthetic frames below are TEST FIXTURES ONLY: they exercise the evaluation code and are
never written to the database or presented as Mumbai data."""
import json

import numpy as np
import pandas as pd
import pytest

from app.ml.forecast import (
    TimeOfDayBaseline,
    chronological_split,
    forecast_status,
    predict,
    quality_report,
    train_and_evaluate,
)


def fixture_frame(days=30, per_day=24, seed=0):
    rng = np.random.default_rng(seed)
    t = pd.date_range("2026-01-01", periods=days * per_day, freq=f"{24 // per_day}h", tz="UTC")
    rows = []
    for i, ts in enumerate(t):
        od = ["a", "b"][i % 2]
        h = ts.tz_convert("Asia/Kolkata").hour
        peak = 600 if h in (9, 10, 18, 19) else 0
        rows.append((od, ts, 1200 + (300 if od == "b" else 0) + peak + rng.normal(0, 60)))
    return pd.DataFrame(rows, columns=["od_pair_id", "departure_at", "duration_s"])


def test_insufficient_data_is_reported_not_trained(tmp_path):
    out = train_and_evaluate(fixture_frame(days=3), tmp_path)
    assert out["status"] == "insufficient_data" and any("days" in r for r in out["reasons"])
    assert not (tmp_path / "models").exists()
    assert forecast_status(tmp_path)["status"] == "insufficient_data"
    with pytest.raises(LookupError):
        predict(tmp_path, "a", pd.Timestamp("2026-02-01T09:00Z").to_pydatetime())


def test_chronological_split_has_no_leakage():
    df = fixture_frame()
    s = chronological_split(df)
    assert s.train["departure_at"].max() < s.val["departure_at"].min()
    assert s.val["departure_at"].max() < s.test["departure_at"].min()
    assert len(s.train) + len(s.val) + len(s.test) == len(df)


def test_quality_report_removes_and_counts():
    df = fixture_frame(days=2)
    df = pd.concat([df, df.iloc[[0]], pd.DataFrame([("a", df.departure_at.iloc[5] + pd.Timedelta("1min"), -5.0), ("a", df.departure_at.iloc[6] + pd.Timedelta("1min"), 99999.0)], columns=df.columns)])
    clean, rep = quality_report(df)
    assert rep["rows_duplicate"] == 1 and rep["rows_non_positive"] == 1 and rep["rows_outlier"] == 1
    assert rep["rows_usable"] == len(clean) == 48


def test_training_evaluates_against_baseline_and_versions_artifacts(tmp_path):
    out = train_and_evaluate(fixture_frame(), tmp_path)
    assert out["status"] == "trained" and out["requirements_met"]
    for split in ("validation_metrics", "test_metrics"):
        for who in ("baseline", "model"):
            m = out[split][who]
            assert m["mae_s"] >= 0 and m["rmse_s"] >= m["mae_s"] and m["n"] > 0
    meta = json.loads((tmp_path / out["artifact"] / "metadata.json").read_text())
    assert meta["model_version"] == out["model_version"] and meta["training_period"]["to"] < meta["test_period"]["from"]
    p = predict(tmp_path, "b", pd.Timestamp("2026-02-02T04:00Z").to_pydatetime())  # 09:30 IST
    assert p["kind"] == "FORECAST" and p["duration_s"] > 1500


def test_baseline_fallbacks():
    df = fixture_frame(days=2)
    b = TimeOfDayBaseline().fit(df)
    unseen = pd.DataFrame({"od_pair_id": ["zzz"], "departure_at": [pd.Timestamp("2026-01-01T00:00Z")]})
    assert b.predict(unseen)[0] == pytest.approx(df.duration_s.median())
