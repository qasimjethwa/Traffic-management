from __future__ import annotations

import pandas as pd
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..models import JourneyObservation


def load_eligible(session: Session) -> pd.DataFrame:
    """OBSERVED, ML-eligible journey observations only."""
    rows = session.execute(
        select(JourneyObservation.od_pair_id, JourneyObservation.departure_at, JourneyObservation.duration_s).where(
            JourneyObservation.kind == "OBSERVED", JourneyObservation.ml_eligible.is_(True)
        )
    ).all()
    df = pd.DataFrame(rows, columns=["od_pair_id", "departure_at", "duration_s"])
    if len(df):
        df["departure_at"] = pd.to_datetime(df["departure_at"], utc=True)
    else:
        df["departure_at"] = pd.to_datetime(df["departure_at"], utc=True)
    return df
