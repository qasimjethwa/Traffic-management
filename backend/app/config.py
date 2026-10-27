from __future__ import annotations

from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

BACKEND_DIR = Path(__file__).resolve().parent.parent
REPO_DIR = BACKEND_DIR.parent


class Settings(BaseSettings):
    """All configuration comes from environment variables prefixed MF_ (or backend/.env)."""

    model_config = SettingsConfigDict(env_prefix="MF_", env_file=BACKEND_DIR / ".env", extra="ignore")

    database_url: str = "postgresql+psycopg://mumbai_flow:mumbai_flow@localhost:5432/mumbai_flow"
    # Comma-separated list of allowed browser origins.
    cors_origins: str = "http://localhost:5173,http://localhost:4173"

    # HTTP behaviour shared by every provider.
    http_timeout_s: float = 10.0
    http_retries: int = 2
    http_backoff_s: float = 0.8

    # OSRM (road routing on OpenStreetMap data, no traffic).
    osrm_url: str = "https://router.project-osrm.org"
    osrm_min_interval_s: float = 1.0

    # Google Routes API (traffic-aware). Optional; never stored, never drawn on a map (Google terms).
    google_maps_api_key: str | None = None
    google_routes_daily_cap: int = 90
    google_routes_per_minute_cap: int = 6

    # Open-Meteo weather (model-based current conditions).
    open_meteo_url: str = "https://api.open-meteo.com/v1/forecast"
    open_meteo_api_key: str | None = None  # only for Open-Meteo commercial plans

    reference_dir: Path = REPO_DIR / "src" / "data" / "reference"
    static_snapshot_dir: Path = REPO_DIR / "public" / "data" / "real"
    ml_artifacts_dir: Path = BACKEND_DIR / "ml_artifacts"

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()
