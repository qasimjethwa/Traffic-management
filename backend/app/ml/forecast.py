"""Journey-time forecasting pipeline (scikit-learn).

Target: journey duration in seconds for a departure from an OD pair at a given time.
Eligible data: OBSERVED journey_observations with ml_eligible = true (operator-recorded trips).
OSRM free-flow times (constant) and Google Routes results (terms forbid ML use) are never used.

The pipeline refuses to train unless the data meets REQUIREMENTS, uses strictly chronological
train/validation/test splits, and always reports a time-of-day baseline next to the model.
"""
from __future__ import annotations

import hashlib
import json
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path

import joblib
import numpy as np
import pandas as pd
import sklearn
from sklearn.ensemble import HistGradientBoostingRegressor

from ..provenance import IST, iso_utc, utcnow

TARGET = "duration_s"
FEATURES = ["od_pair_id (one-hot)", "hour_of_day_ist (sin/cos)", "day_of_week_ist (sin/cos)", "is_weekend"]
REQUIREMENTS = {
    "min_samples": 300,
    "min_distinct_days": 14,
    "min_samples_per_od_pair": 30,
    "min_test_samples": 40,
}
VAL_FRAC = 0.2
TEST_FRAC = 0.2


# ---------------------------------------------------------------- data quality
def quality_report(df: pd.DataFrame) -> tuple[pd.DataFrame, dict]:
    """Removes unusable rows and reports exactly what was removed."""
    n0 = len(df)
    df = df.dropna(subset=["od_pair_id", "departure_at", TARGET])
    missing = n0 - len(df)
    df = df[df[TARGET] > 0]
    nonpos = n0 - missing - len(df)
    before = len(df)
    df = df.drop_duplicates(subset=["od_pair_id", "departure_at"], keep="first")
    dups = before - len(df)
    # Physical-plausibility screen only: congestion legitimately doubles or triples journey times,
    # so only values beyond 5x / below 0.2x of the pair's median are treated as recording errors.
    med = df.groupby("od_pair_id")[TARGET].transform("median")
    outlier = (df[TARGET] > 5 * med) | (df[TARGET] < 0.2 * med)
    df = df[~outlier].sort_values("departure_at").reset_index(drop=True)
    ist = df["departure_at"].dt.tz_convert(IST)
    report = {
        "rows_loaded": n0,
        "rows_missing_fields": int(missing),
        "rows_non_positive": int(nonpos),
        "rows_duplicate": int(dups),
        "rows_outlier": int(outlier.sum()),
        "rows_usable": int(len(df)),
        "distinct_days_ist": int(ist.dt.date.nunique()) if len(df) else 0,
        "per_od_pair": {k: int(v) for k, v in df["od_pair_id"].value_counts().items()},
        "first_departure": iso_utc(df["departure_at"].min().to_pydatetime()) if len(df) else None,
        "last_departure": iso_utc(df["departure_at"].max().to_pydatetime()) if len(df) else None,
    }
    return df, report


def check_sufficiency(report: dict) -> list[str]:
    reasons = []
    r = REQUIREMENTS
    if report["rows_usable"] < r["min_samples"]:
        reasons.append(f"{report['rows_usable']} usable observations; at least {r['min_samples']} required")
    if report["distinct_days_ist"] < r["min_distinct_days"]:
        reasons.append(f"data covers {report['distinct_days_ist']} days; at least {r['min_distinct_days']} required")
    thin = [k for k, v in report["per_od_pair"].items() if v < r["min_samples_per_od_pair"]]
    if report["per_od_pair"] and len(thin) == len(report["per_od_pair"]):
        reasons.append(f"no OD pair has {r['min_samples_per_od_pair']}+ observations")
    if int(report["rows_usable"] * TEST_FRAC) < r["min_test_samples"]:
        reasons.append(f"test split would hold fewer than {r['min_test_samples']} observations")
    return reasons


# ---------------------------------------------------------------- splits & features
@dataclass
class Split:
    train: pd.DataFrame
    val: pd.DataFrame
    test: pd.DataFrame


def chronological_split(df: pd.DataFrame, val_frac: float = VAL_FRAC, test_frac: float = TEST_FRAC) -> Split:
    """Cut on timestamps (not row counts) so no departure time is shared across splits: no temporal leakage."""
    df = df.sort_values("departure_at").reset_index(drop=True)
    t_val = df["departure_at"].quantile(1 - val_frac - test_frac)
    t_test = df["departure_at"].quantile(1 - test_frac)
    train = df[df["departure_at"] < t_val]
    val = df[(df["departure_at"] >= t_val) & (df["departure_at"] < t_test)]
    test = df[df["departure_at"] >= t_test]
    return Split(train, val, test)


def make_features(df: pd.DataFrame, od_levels: list[str]) -> np.ndarray:
    ist = df["departure_at"].dt.tz_convert(IST)
    hour = ist.dt.hour + ist.dt.minute / 60
    dow = ist.dt.day_of_week
    cols = [
        np.sin(2 * np.pi * hour / 24),
        np.cos(2 * np.pi * hour / 24),
        np.sin(2 * np.pi * dow / 7),
        np.cos(2 * np.pi * dow / 7),
        (dow >= 5).astype(float),
    ]
    onehot = [(df["od_pair_id"] == lvl).astype(float) for lvl in od_levels]
    return np.column_stack([*cols, *onehot])


class TimeOfDayBaseline:
    """Median duration per (OD pair, IST hour, weekend flag), falling back to the pair median, then the global median."""

    def fit(self, df: pd.DataFrame) -> "TimeOfDayBaseline":
        k = self._keys(df)
        self.by_slot = df.groupby(k)[TARGET].median().to_dict()
        self.by_od = df.groupby("od_pair_id")[TARGET].median().to_dict()
        self.global_ = float(df[TARGET].median())
        return self

    @staticmethod
    def _keys(df: pd.DataFrame) -> list[pd.Series]:
        ist = df["departure_at"].dt.tz_convert(IST)
        return [df["od_pair_id"], ist.dt.hour.rename("h"), (ist.dt.day_of_week >= 5).rename("we")]

    def predict(self, df: pd.DataFrame) -> np.ndarray:
        od, h, we = self._keys(df)
        out = []
        for a, b, c in zip(od, h, we):
            v = self.by_slot.get((a, b, c))
            if v is None:
                v = self.by_od.get(a, self.global_)
            out.append(v)
        return np.asarray(out, dtype=float)


def metrics(y: np.ndarray, p: np.ndarray) -> dict:
    err = p - y
    return {"mae_s": round(float(np.mean(np.abs(err))), 2), "rmse_s": round(float(np.sqrt(np.mean(err**2))), 2), "n": int(len(y))}


# ---------------------------------------------------------------- training
def _status_path(artifacts_dir: Path) -> Path:
    return artifacts_dir / "status.json"


def _write_status(artifacts_dir: Path, status: dict) -> dict:
    artifacts_dir.mkdir(parents=True, exist_ok=True)
    _status_path(artifacts_dir).write_text(json.dumps(status, indent=2) + "\n")
    return status


def train_and_evaluate(df: pd.DataFrame, artifacts_dir: Path, *, enforce_requirements: bool = True) -> dict:
    df, quality = quality_report(df)
    reasons = check_sufficiency(quality)
    base = {"checked_at": iso_utc(utcnow()), "target": TARGET, "requirements": REQUIREMENTS, "data_quality": quality}
    if reasons and enforce_requirements:
        return _write_status(artifacts_dir, {**base, "status": "insufficient_data", "reasons": reasons})

    split = chronological_split(df)
    if min(len(split.train), len(split.val), len(split.test)) == 0:
        return _write_status(artifacts_dir, {**base, "status": "insufficient_data", "reasons": ["a chronological split is empty"]})
    assert split.train["departure_at"].max() < split.val["departure_at"].min() <= split.val["departure_at"].max() < split.test["departure_at"].min()

    od_levels = sorted(df["od_pair_id"].unique())
    # validation: fit on train only
    baseline = TimeOfDayBaseline().fit(split.train)
    model = HistGradientBoostingRegressor(max_iter=300, learning_rate=0.05, l2_regularization=1.0, random_state=0)
    model.fit(make_features(split.train, od_levels), split.train[TARGET].to_numpy())
    yv = split.val[TARGET].to_numpy()
    val = {"baseline": metrics(yv, baseline.predict(split.val)), "model": metrics(yv, model.predict(make_features(split.val, od_levels)))}

    # test: refit both on train+val, evaluate once on the untouched test period
    trval = pd.concat([split.train, split.val])
    baseline = TimeOfDayBaseline().fit(trval)
    model.fit(make_features(trval, od_levels), trval[TARGET].to_numpy())
    yt = split.test[TARGET].to_numpy()
    test = {"baseline": metrics(yt, baseline.predict(split.test)), "model": metrics(yt, model.predict(make_features(split.test, od_levels)))}
    selected = "model" if test["model"]["mae_s"] < test["baseline"]["mae_s"] else "baseline"

    data_hash = hashlib.sha256(pd.util.hash_pandas_object(df[["od_pair_id", "departure_at", TARGET]], index=False).values.tobytes()).hexdigest()
    version = f"{utcnow():%Y%m%dT%H%M%SZ}-{data_hash[:8]}"
    out = artifacts_dir / "models" / version
    out.mkdir(parents=True, exist_ok=True)
    joblib.dump({"model": model, "baseline": baseline, "od_levels": od_levels, "selected": selected}, out / "model.joblib")
    meta = {
        **base,
        "status": "trained",
        "requirements_met": not reasons,
        "unmet_requirements": reasons,
        "model_version": version,
        "algorithm": "HistGradientBoostingRegressor",
        "sklearn_version": sklearn.__version__,
        "features": FEATURES,
        "od_pairs": od_levels,
        "training_period": {"from": iso_utc(trval["departure_at"].min().to_pydatetime()), "to": iso_utc(trval["departure_at"].max().to_pydatetime())},
        "test_period": {"from": iso_utc(split.test["departure_at"].min().to_pydatetime()), "to": iso_utc(split.test["departure_at"].max().to_pydatetime())},
        "split_sizes": {"train": len(split.train), "validation": len(split.val), "test": len(split.test)},
        "validation_metrics": val,
        "test_metrics": test,
        "selected_predictor": selected,
        "data_sha256": data_hash,
        "artifact": str(out.relative_to(artifacts_dir)),
    }
    (out / "metadata.json").write_text(json.dumps(meta, indent=2) + "\n")
    return _write_status(artifacts_dir, meta)


def forecast_status(artifacts_dir: Path) -> dict:
    p = _status_path(artifacts_dir)
    if not p.exists():
        return {"status": "unavailable", "reasons": ["the training pipeline has not been run"], "requirements": REQUIREMENTS}
    return json.loads(p.read_text())


def predict(artifacts_dir: Path, od_pair_id: str, departure_at: datetime) -> dict:
    status = forecast_status(artifacts_dir)
    if status.get("status") != "trained" or not status.get("requirements_met"):
        raise LookupError("no validated model is available")
    bundle = joblib.load(artifacts_dir / status["artifact"] / "model.joblib")
    if od_pair_id not in bundle["od_levels"]:
        raise LookupError(f"model was not trained on OD pair {od_pair_id!r}")
    row = pd.DataFrame({"od_pair_id": [od_pair_id], "departure_at": [pd.Timestamp(departure_at)]})
    if bundle["selected"] == "model":
        value = float(bundle["model"].predict(make_features(row, bundle["od_levels"]))[0])
    else:
        value = float(bundle["baseline"].predict(row)[0])
    return {
        "kind": "FORECAST",
        "od_pair_id": od_pair_id,
        "departure_at": iso_utc(departure_at),
        "duration_s": round(value, 1),
        "predictor": bundle["selected"],
        "model_version": status["model_version"],
        "test_mae_s": status["test_metrics"][bundle["selected"]]["mae_s"],
    }
