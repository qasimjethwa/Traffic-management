"""Database schema. All timestamps are timestamptz stored in UTC."""
from __future__ import annotations

from datetime import date, datetime

from geoalchemy2 import Geometry
from sqlalchemy import (
    BigInteger,
    Boolean,
    CheckConstraint,
    Date,
    DateTime,
    Float,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


class Base(DeclarativeBase):
    pass


TS = DateTime(timezone=True)


class DataSource(Base):
    """A provider or dataset. `kind` is the DataKind of the values it produces."""

    __tablename__ = "data_sources"
    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    name: Mapped[str] = mapped_column(String(200))
    kind: Mapped[str] = mapped_column(String(16))
    license: Mapped[str | None] = mapped_column(String(300))
    attribution: Mapped[str | None] = mapped_column(Text)
    url: Mapped[str | None] = mapped_column(String(500))
    notes: Mapped[str | None] = mapped_column(Text)
    stale_after_s: Mapped[int | None] = mapped_column(Integer)
    storable: Mapped[bool] = mapped_column(Boolean, default=True)
    __table_args__ = (CheckConstraint("kind IN ('OBSERVED','ESTIMATED','FORECAST')", name="ck_source_kind_real"),)


class Corridor(Base):
    __tablename__ = "corridors"
    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    name: Mapped[str] = mapped_column(String(200))
    route_code: Mapped[str] = mapped_column(String(16))
    geom = mapped_column(Geometry("LINESTRING", srid=4326, spatial_index=False), nullable=False)
    length_km: Mapped[float] = mapped_column(Float)
    free_flow_duration_s: Mapped[float] = mapped_column(Float)
    source_id: Mapped[str] = mapped_column(ForeignKey("data_sources.id"))
    retrieved_at: Mapped[datetime] = mapped_column(TS)
    __table_args__ = (Index("ix_corridors_geom", "geom", postgresql_using="gist"),)


class OdPair(Base):
    __tablename__ = "od_pairs"
    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    name: Mapped[str] = mapped_column(String(200))
    origin_name: Mapped[str] = mapped_column(String(120))
    destination_name: Mapped[str] = mapped_column(String(120))
    origin = mapped_column(Geometry("POINT", srid=4326, spatial_index=False), nullable=False)
    destination = mapped_column(Geometry("POINT", srid=4326, spatial_index=False), nullable=False)
    __table_args__ = (Index("ix_od_pairs_origin", "origin", postgresql_using="gist"),)


class JourneyObservation(Base):
    """Timestamped journey durations. SIMULATED values are rejected by a CHECK constraint."""

    __tablename__ = "journey_observations"
    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    od_pair_id: Mapped[str] = mapped_column(ForeignKey("od_pairs.id"), index=True)
    source_id: Mapped[str] = mapped_column(ForeignKey("data_sources.id"), index=True)
    kind: Mapped[str] = mapped_column(String(16))
    traffic_aware: Mapped[bool] = mapped_column(Boolean)
    ml_eligible: Mapped[bool] = mapped_column(Boolean)
    departure_at: Mapped[datetime] = mapped_column(TS, index=True)
    retrieved_at: Mapped[datetime] = mapped_column(TS)
    duration_s: Mapped[float] = mapped_column(Float)
    distance_m: Mapped[float | None] = mapped_column(Float)
    vehicle_ref: Mapped[str | None] = mapped_column(String(64))
    dedup_key: Mapped[str] = mapped_column(String(200), unique=True)
    meta: Mapped[dict | None] = mapped_column(JSONB)
    __table_args__ = (
        CheckConstraint("kind IN ('OBSERVED','ESTIMATED')", name="ck_journey_kind_real"),
        CheckConstraint("duration_s > 0", name="ck_journey_duration_pos"),
    )


class WeatherObservation(Base):
    __tablename__ = "weather_observations"
    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    source_id: Mapped[str] = mapped_column(ForeignKey("data_sources.id"))
    kind: Mapped[str] = mapped_column(String(16))
    valid_at: Mapped[datetime] = mapped_column(TS, index=True)
    retrieved_at: Mapped[datetime] = mapped_column(TS)
    lat: Mapped[float] = mapped_column(Float)
    lon: Mapped[float] = mapped_column(Float)
    temperature_c: Mapped[float | None] = mapped_column(Float)
    precipitation_mm: Mapped[float | None] = mapped_column(Float)
    rain_mm: Mapped[float | None] = mapped_column(Float)
    weather_code: Mapped[int | None] = mapped_column(Integer)
    wind_speed_kmh: Mapped[float | None] = mapped_column(Float)
    dedup_key: Mapped[str] = mapped_column(String(200), unique=True)
    __table_args__ = (CheckConstraint("kind IN ('OBSERVED','ESTIMATED')", name="ck_weather_kind_real"),)


class IngestionRun(Base):
    __tablename__ = "ingestion_runs"
    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    job: Mapped[str] = mapped_column(String(64), index=True)
    source_id: Mapped[str | None] = mapped_column(ForeignKey("data_sources.id"))
    started_at: Mapped[datetime] = mapped_column(TS)
    finished_at: Mapped[datetime | None] = mapped_column(TS)
    status: Mapped[str] = mapped_column(String(16))
    inserted: Mapped[int] = mapped_column(Integer, default=0)
    duplicates: Mapped[int] = mapped_column(Integer, default=0)
    invalid: Mapped[int] = mapped_column(Integer, default=0)
    error: Mapped[str | None] = mapped_column(Text)
    details: Mapped[dict | None] = mapped_column(JSONB)
    __table_args__ = (
        CheckConstraint("status IN ('running','success','partial','failed','skipped')", name="ck_run_status"),
    )


class ProviderRequest(Base):
    """Request log without response content (used for quotas and provider health)."""

    __tablename__ = "provider_requests"
    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    provider: Mapped[str] = mapped_column(String(64), index=True)
    requested_at: Mapped[datetime] = mapped_column(TS, index=True)
    ok: Mapped[bool] = mapped_column(Boolean)
    error_kind: Mapped[str | None] = mapped_column(String(32))
    latency_ms: Mapped[int | None] = mapped_column(Integer)


class GtfsFeed(Base):
    __tablename__ = "gtfs_feeds"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    source_url: Mapped[str] = mapped_column(String(500))
    license: Mapped[str] = mapped_column(String(300))
    sha256: Mapped[str] = mapped_column(String(64), unique=True)
    agency_name: Mapped[str | None] = mapped_column(String(200))
    feed_start_date: Mapped[date | None] = mapped_column(Date)
    feed_end_date: Mapped[date | None] = mapped_column(Date)
    imported_at: Mapped[datetime] = mapped_column(TS)
    stops_count: Mapped[int] = mapped_column(Integer)
    routes_count: Mapped[int] = mapped_column(Integer)
    warnings: Mapped[list | None] = mapped_column(JSONB)


class GtfsStop(Base):
    __tablename__ = "gtfs_stops"
    feed_id: Mapped[int] = mapped_column(ForeignKey("gtfs_feeds.id", ondelete="CASCADE"), primary_key=True)
    stop_id: Mapped[str] = mapped_column(String(64), primary_key=True)
    name: Mapped[str] = mapped_column(String(200))
    geom = mapped_column(Geometry("POINT", srid=4326, spatial_index=False), nullable=False)
    __table_args__ = (Index("ix_gtfs_stops_geom", "geom", postgresql_using="gist"),)


class GtfsRoute(Base):
    __tablename__ = "gtfs_routes"
    feed_id: Mapped[int] = mapped_column(ForeignKey("gtfs_feeds.id", ondelete="CASCADE"), primary_key=True)
    route_id: Mapped[str] = mapped_column(String(64), primary_key=True)
    short_name: Mapped[str | None] = mapped_column(String(64))
    long_name: Mapped[str | None] = mapped_column(String(300))
    route_type: Mapped[int] = mapped_column(Integer)


class OperatorAction(Base):
    """Operator decisions on incidents. Demo incidents are recorded with incident_kind='SIMULATED'."""

    __tablename__ = "operator_actions"
    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    incident_ref: Mapped[str] = mapped_column(String(64), index=True)
    incident_kind: Mapped[str] = mapped_column(String(16))
    action: Mapped[str] = mapped_column(String(16))
    note: Mapped[str | None] = mapped_column(String(500))
    created_at: Mapped[datetime] = mapped_column(TS)
    __table_args__ = (
        CheckConstraint("incident_kind IN ('OBSERVED','SIMULATED')", name="ck_action_incident_kind"),
        CheckConstraint("action IN ('acknowledge','resolve','reopen')", name="ck_action_action"),
    )
