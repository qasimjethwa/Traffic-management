"""initial schema

Revision ID: 0001
Revises: 
Create Date: 2026-10-27 15:12:45.765431
"""
from alembic import op
import sqlalchemy as sa
import geoalchemy2
from sqlalchemy.dialects import postgresql

revision = '0001'
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("CREATE EXTENSION IF NOT EXISTS postgis")
    op.create_table('data_sources',
    sa.Column('id', sa.String(length=64), nullable=False),
    sa.Column('name', sa.String(length=200), nullable=False),
    sa.Column('kind', sa.String(length=16), nullable=False),
    sa.Column('license', sa.String(length=300), nullable=True),
    sa.Column('attribution', sa.Text(), nullable=True),
    sa.Column('url', sa.String(length=500), nullable=True),
    sa.Column('notes', sa.Text(), nullable=True),
    sa.Column('stale_after_s', sa.Integer(), nullable=True),
    sa.Column('storable', sa.Boolean(), nullable=False),
    sa.CheckConstraint("kind IN ('OBSERVED','ESTIMATED','FORECAST')", name='ck_source_kind_real'),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_table('gtfs_feeds',
    sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
    sa.Column('source_url', sa.String(length=500), nullable=False),
    sa.Column('license', sa.String(length=300), nullable=False),
    sa.Column('sha256', sa.String(length=64), nullable=False),
    sa.Column('agency_name', sa.String(length=200), nullable=True),
    sa.Column('feed_start_date', sa.Date(), nullable=True),
    sa.Column('feed_end_date', sa.Date(), nullable=True),
    sa.Column('imported_at', sa.DateTime(timezone=True), nullable=False),
    sa.Column('stops_count', sa.Integer(), nullable=False),
    sa.Column('routes_count', sa.Integer(), nullable=False),
    sa.Column('warnings', postgresql.JSONB(astext_type=sa.Text()), nullable=True),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('sha256')
    )
    op.create_table('od_pairs',
    sa.Column('id', sa.String(length=64), nullable=False),
    sa.Column('name', sa.String(length=200), nullable=False),
    sa.Column('origin_name', sa.String(length=120), nullable=False),
    sa.Column('destination_name', sa.String(length=120), nullable=False),
    sa.Column('origin', geoalchemy2.types.Geometry(geometry_type='POINT', srid=4326, dimension=2, spatial_index=False, from_text='ST_GeomFromEWKT', name='geometry', nullable=False), nullable=False),
    sa.Column('destination', geoalchemy2.types.Geometry(geometry_type='POINT', srid=4326, dimension=2, spatial_index=False, from_text='ST_GeomFromEWKT', name='geometry', nullable=False), nullable=False),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_table('operator_actions',
    sa.Column('id', sa.BigInteger(), autoincrement=True, nullable=False),
    sa.Column('incident_ref', sa.String(length=64), nullable=False),
    sa.Column('incident_kind', sa.String(length=16), nullable=False),
    sa.Column('action', sa.String(length=16), nullable=False),
    sa.Column('note', sa.String(length=500), nullable=True),
    sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
    sa.CheckConstraint("action IN ('acknowledge','resolve','reopen')", name='ck_action_action'),
    sa.CheckConstraint("incident_kind IN ('OBSERVED','SIMULATED')", name='ck_action_incident_kind'),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_operator_actions_incident_ref'), 'operator_actions', ['incident_ref'], unique=False)
    op.create_table('provider_requests',
    sa.Column('id', sa.BigInteger(), autoincrement=True, nullable=False),
    sa.Column('provider', sa.String(length=64), nullable=False),
    sa.Column('requested_at', sa.DateTime(timezone=True), nullable=False),
    sa.Column('ok', sa.Boolean(), nullable=False),
    sa.Column('error_kind', sa.String(length=32), nullable=True),
    sa.Column('latency_ms', sa.Integer(), nullable=True),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_provider_requests_provider'), 'provider_requests', ['provider'], unique=False)
    op.create_index(op.f('ix_provider_requests_requested_at'), 'provider_requests', ['requested_at'], unique=False)
    op.create_table('corridors',
    sa.Column('id', sa.String(length=64), nullable=False),
    sa.Column('name', sa.String(length=200), nullable=False),
    sa.Column('route_code', sa.String(length=16), nullable=False),
    sa.Column('geom', geoalchemy2.types.Geometry(geometry_type='LINESTRING', srid=4326, dimension=2, spatial_index=False, from_text='ST_GeomFromEWKT', name='geometry', nullable=False), nullable=False),
    sa.Column('length_km', sa.Float(), nullable=False),
    sa.Column('free_flow_duration_s', sa.Float(), nullable=False),
    sa.Column('source_id', sa.String(length=64), nullable=False),
    sa.Column('retrieved_at', sa.DateTime(timezone=True), nullable=False),
    sa.ForeignKeyConstraint(['source_id'], ['data_sources.id'], ),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_table('gtfs_routes',
    sa.Column('feed_id', sa.Integer(), nullable=False),
    sa.Column('route_id', sa.String(length=64), nullable=False),
    sa.Column('short_name', sa.String(length=64), nullable=True),
    sa.Column('long_name', sa.String(length=300), nullable=True),
    sa.Column('route_type', sa.Integer(), nullable=False),
    sa.ForeignKeyConstraint(['feed_id'], ['gtfs_feeds.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('feed_id', 'route_id')
    )
    op.create_table('gtfs_stops',
    sa.Column('feed_id', sa.Integer(), nullable=False),
    sa.Column('stop_id', sa.String(length=64), nullable=False),
    sa.Column('name', sa.String(length=200), nullable=False),
    sa.Column('geom', geoalchemy2.types.Geometry(geometry_type='POINT', srid=4326, dimension=2, spatial_index=False, from_text='ST_GeomFromEWKT', name='geometry', nullable=False), nullable=False),
    sa.ForeignKeyConstraint(['feed_id'], ['gtfs_feeds.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('feed_id', 'stop_id')
    )
    op.create_table('ingestion_runs',
    sa.Column('id', sa.BigInteger(), autoincrement=True, nullable=False),
    sa.Column('job', sa.String(length=64), nullable=False),
    sa.Column('source_id', sa.String(length=64), nullable=True),
    sa.Column('started_at', sa.DateTime(timezone=True), nullable=False),
    sa.Column('finished_at', sa.DateTime(timezone=True), nullable=True),
    sa.Column('status', sa.String(length=16), nullable=False),
    sa.Column('inserted', sa.Integer(), nullable=False),
    sa.Column('duplicates', sa.Integer(), nullable=False),
    sa.Column('invalid', sa.Integer(), nullable=False),
    sa.Column('error', sa.Text(), nullable=True),
    sa.Column('details', postgresql.JSONB(astext_type=sa.Text()), nullable=True),
    sa.CheckConstraint("status IN ('running','success','partial','failed','skipped')", name='ck_run_status'),
    sa.ForeignKeyConstraint(['source_id'], ['data_sources.id'], ),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_ingestion_runs_job'), 'ingestion_runs', ['job'], unique=False)
    op.create_table('journey_observations',
    sa.Column('id', sa.BigInteger(), autoincrement=True, nullable=False),
    sa.Column('od_pair_id', sa.String(length=64), nullable=False),
    sa.Column('source_id', sa.String(length=64), nullable=False),
    sa.Column('kind', sa.String(length=16), nullable=False),
    sa.Column('traffic_aware', sa.Boolean(), nullable=False),
    sa.Column('ml_eligible', sa.Boolean(), nullable=False),
    sa.Column('departure_at', sa.DateTime(timezone=True), nullable=False),
    sa.Column('retrieved_at', sa.DateTime(timezone=True), nullable=False),
    sa.Column('duration_s', sa.Float(), nullable=False),
    sa.Column('distance_m', sa.Float(), nullable=True),
    sa.Column('vehicle_ref', sa.String(length=64), nullable=True),
    sa.Column('dedup_key', sa.String(length=200), nullable=False),
    sa.Column('meta', postgresql.JSONB(astext_type=sa.Text()), nullable=True),
    sa.CheckConstraint("kind IN ('OBSERVED','ESTIMATED')", name='ck_journey_kind_real'),
    sa.CheckConstraint('duration_s > 0', name='ck_journey_duration_pos'),
    sa.ForeignKeyConstraint(['od_pair_id'], ['od_pairs.id'], ),
    sa.ForeignKeyConstraint(['source_id'], ['data_sources.id'], ),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('dedup_key')
    )
    op.create_index(op.f('ix_journey_observations_departure_at'), 'journey_observations', ['departure_at'], unique=False)
    op.create_index(op.f('ix_journey_observations_od_pair_id'), 'journey_observations', ['od_pair_id'], unique=False)
    op.create_index(op.f('ix_journey_observations_source_id'), 'journey_observations', ['source_id'], unique=False)
    op.create_table('weather_observations',
    sa.Column('id', sa.BigInteger(), autoincrement=True, nullable=False),
    sa.Column('source_id', sa.String(length=64), nullable=False),
    sa.Column('kind', sa.String(length=16), nullable=False),
    sa.Column('valid_at', sa.DateTime(timezone=True), nullable=False),
    sa.Column('retrieved_at', sa.DateTime(timezone=True), nullable=False),
    sa.Column('lat', sa.Float(), nullable=False),
    sa.Column('lon', sa.Float(), nullable=False),
    sa.Column('temperature_c', sa.Float(), nullable=True),
    sa.Column('precipitation_mm', sa.Float(), nullable=True),
    sa.Column('rain_mm', sa.Float(), nullable=True),
    sa.Column('weather_code', sa.Integer(), nullable=True),
    sa.Column('wind_speed_kmh', sa.Float(), nullable=True),
    sa.Column('dedup_key', sa.String(length=200), nullable=False),
    sa.CheckConstraint("kind IN ('OBSERVED','ESTIMATED')", name='ck_weather_kind_real'),
    sa.ForeignKeyConstraint(['source_id'], ['data_sources.id'], ),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('dedup_key')
    )
    op.create_index(op.f('ix_weather_observations_valid_at'), 'weather_observations', ['valid_at'], unique=False)
    op.create_index('ix_corridors_geom', 'corridors', ['geom'], postgresql_using='gist')
    op.create_index('ix_gtfs_stops_geom', 'gtfs_stops', ['geom'], postgresql_using='gist')
    op.create_index('ix_od_pairs_origin', 'od_pairs', ['origin'], postgresql_using='gist')


def downgrade() -> None:
    op.drop_index(op.f('ix_weather_observations_valid_at'), table_name='weather_observations')
    op.drop_table('weather_observations')
    op.drop_index(op.f('ix_journey_observations_source_id'), table_name='journey_observations')
    op.drop_index(op.f('ix_journey_observations_od_pair_id'), table_name='journey_observations')
    op.drop_index(op.f('ix_journey_observations_departure_at'), table_name='journey_observations')
    op.drop_table('journey_observations')
    op.drop_index(op.f('ix_ingestion_runs_job'), table_name='ingestion_runs')
    op.drop_table('ingestion_runs')
    op.drop_table('gtfs_stops')
    op.drop_table('gtfs_routes')
    op.drop_table('corridors')
    op.drop_index(op.f('ix_provider_requests_requested_at'), table_name='provider_requests')
    op.drop_index(op.f('ix_provider_requests_provider'), table_name='provider_requests')
    op.drop_table('provider_requests')
    op.drop_index(op.f('ix_operator_actions_incident_ref'), table_name='operator_actions')
    op.drop_table('operator_actions')
    op.drop_table('od_pairs')
    op.drop_table('gtfs_feeds')
    op.drop_table('data_sources')
