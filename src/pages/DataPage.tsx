import { useCallback, useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Database, RefreshCw, ShieldCheck } from 'lucide-react';
import { useApp } from '../app/store';
import { API_URL, ApiError, api, type Estimate, type ForecastStatus, type GtfsFeed, type JourneySummary, type Run, type SourceInfo, type Weather } from '../services/api/client';
import { DataBadge, FreshnessPill } from '../components/ui/DataBadge';
import { Empty } from '../components/ui/primitives';
import { tooltipStyle } from '../components/analytics/OpsWidgets';
import { formatIST, freshness } from '../types/provenance';
import odPairsRef from '../data/reference/od_pairs.json';

type Load<T> = { state: 'idle' | 'loading' } | { state: 'ok'; data: T } | { state: 'error'; error: ApiError };

function useApi<T>(fn: () => Promise<T>, deps: unknown[] = []): [Load<T>, () => void] {
  const [s, set] = useState<Load<T>>({ state: API_URL ? 'loading' : 'idle' });
  const run = useCallback(() => {
    if (!API_URL) return;
    set({ state: 'loading' });
    fn()
      .then((data) => set({ state: 'ok', data }))
      .catch((e: unknown) => set({ state: 'error', error: e instanceof ApiError ? e : new ApiError(0, 'error', String(e)) }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  useEffect(run, [run]);
  return [s, run];
}

const mins = (s: number) => `${(s / 60).toFixed(1)} min`;

function Unavailable({ load, what }: { load: Load<unknown>; what: string }) {
  if (!API_URL) return <div className="source-note">Backend not configured (set VITE_API_URL) — {what} unavailable in static mode.</div>;
  if (load.state === 'loading') return <div className="shimmer" style={{ height: 40, borderRadius: 10, background: 'rgba(255,255,255,0.03)' }} />;
  if (load.state === 'error') return <div className="source-note crit-t">{what} unavailable: {load.error.code} — {load.error.message}</div>;
  return null;
}

function SnapshotCard() {
  const { realSnapshot, geometrySource } = useApp();
  const ds = realSnapshot.data?.manifest.datasets ?? [];
  const approx = Object.entries(geometrySource).filter(([, v]) => v === 'waypoints').map(([k]) => k);
  return (
    <section className="card card-pad">
      <div className="card-title">Static real-data snapshot <span className="muted" style={{ fontSize: 12 }}>works without a backend</span></div>
      {realSnapshot.status === 'loading' && <div className="source-note">Loading…</div>}
      {realSnapshot.status === 'missing' && <div className="source-note">No snapshot found (public/data/real). Run the corridor importer in backend/.</div>}
      {realSnapshot.status === 'error' && <div className="source-note crit-t">Snapshot failed to load: {realSnapshot.error}</div>}
      {ds.map((d) => (
        <div key={d.id} style={{ marginTop: 10 }}>
          <div className="kv-row"><span>{d.id === 'corridors' ? 'Corridor road geometry' : d.id}</span><span><DataBadge kind={d.kind as 'ESTIMATED'} freshness={freshness({ retrievedAt: d.retrievedAt, staleAfterSeconds: d.staleAfterSeconds })} /></span></div>
          <div className="kv-row"><span className="muted">Source</span><span>{d.sourceName}</span></div>
          <div className="kv-row"><span className="muted">Imported</span><span>{formatIST(d.retrievedAt)}</span></div>
          <div className="kv-row"><span className="muted">Records</span><span>{d.records} validated · {d.validation.invalid} rejected</span></div>
          <div className="kv-row"><span className="muted">Licence</span><span style={{ textAlign: 'right' }}>{d.license}</span></div>
          {d.validation.errors.length > 0 && (
            <div className="source-note" style={{ marginTop: 6, lineHeight: 1.5 }}>
              Rejected by validation (drawn with approximate waypoints instead): {d.validation.errors.join(' · ')}
            </div>
          )}
          <div className="source-note" style={{ marginTop: 6 }}>{d.notes}</div>
        </div>
      ))}
      {approx.length > 0 && realSnapshot.status !== 'loading' && <div className="source-note" style={{ marginTop: 8 }}>Corridors on approximate geometry: {approx.join(', ')}</div>}
    </section>
  );
}

function SourcesCard({ load }: { load: Load<{ sources: SourceInfo[] }> }) {
  return (
    <section className="card card-pad wide">
      <div className="card-title">Data sources &amp; provider health</div>
      <Unavailable load={load} what="Source status" />
      {load.state === 'ok' && (
        <div style={{ overflowX: 'auto', marginTop: 8 }}>
          <table className="data">
            <thead><tr><th>Source</th><th>Kind</th><th>Health</th><th>Latest record</th><th>Freshness</th><th className="hide-mobile">Last run</th><th className="hide-mobile">Licence</th></tr></thead>
            <tbody>
              {load.data.sources.map((s) => (
                <tr key={s.id} style={{ cursor: 'default' }} title={s.notes ?? ''}>
                  <td>{s.name}<div className="muted" style={{ fontSize: 11 }}>{s.notes}</div></td>
                  <td><DataBadge kind={s.kind} /></td>
                  <td className={s.health === 'ok' ? 'ok-t' : s.health.startsWith('failing') ? 'crit-t' : 'muted'}>{s.health.replace('_', ' ')}</td>
                  <td className="mono" style={{ fontSize: 12 }}>{s.storable ? formatIST(s.latest_record_at) : '— (not stored)'}</td>
                  <td><FreshnessPill value={s.freshness} /></td>
                  <td className="hide-mobile" style={{ fontSize: 12 }}>{s.last_run ? <>{s.last_run.status} · {formatIST(s.last_run.finished_at)}</> : '—'}{s.last_run?.error && <div className="muted" style={{ fontSize: 11, maxWidth: 260 }}>{s.last_run.error.slice(0, 140)}</div>}</td>
                  <td className="hide-mobile muted" style={{ fontSize: 11.5 }}>{s.license}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function JourneyCard({ summary }: { summary: Load<JourneySummary> }) {
  const pairs = odPairsRef.od_pairs;
  const [pair, setPair] = useState(pairs[0].id);
  const [obs] = useApi(() => api.observations(pair), [pair]);
  const [est, setEst] = useState<Record<string, Estimate | ApiError | 'loading'>>({});
  const chart = useMemo(() => {
    if (obs.state !== 'ok') return [];
    return obs.data.observations.map((o) => ({ t: Date.parse(o.departure_at), min: o.duration_s / 60, source: o.source }));
  }, [obs]);
  const operatorPoints = chart.filter((c) => c.source === 'operator-upload');
  const request = (provider: 'osrm' | 'google-routes') => {
    const key = `${pair}:${provider}`;
    setEst((e) => ({ ...e, [key]: 'loading' }));
    api.estimate(pair, provider).then(
      (r) => setEst((e) => ({ ...e, [key]: r })),
      (err: ApiError) => setEst((e) => ({ ...e, [key]: err })),
    );
  };
  const row = summary.state === 'ok' ? summary.data.od_pairs.find((p) => p.od_pair_id === pair) : undefined;
  return (
    <section className="card card-pad wide">
      <div className="card-title" style={{ flexWrap: 'wrap' }}>
        Journey times
        <select className="select" value={pair} onChange={(e) => setPair(e.target.value)} aria-label="Origin–destination pair">
          {pairs.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      </div>
      <Unavailable load={summary} what="Journey observations" />
      {row && (
        <div className="data-grid" style={{ marginTop: 10 }}>
          {row.sources.map((s) => (
            <div key={s.source} className="fact">
              <div className="k" style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                {s.source === 'osrm' ? 'Free-flow road time (OSRM)' : 'Operator-recorded trip times'}
                {s.latest ? <DataBadge kind={s.latest.kind} freshness={s.freshness as 'fresh'} /> : <DataBadge kind="UNAVAILABLE" />}
              </div>
              <div className="v">{s.latest ? mins(s.latest.duration_s) : 'No data'}</div>
              <div className="source-note" style={{ marginTop: 4 }}>
                {s.count} record{s.count === 1 ? '' : 's'} · latest {formatIST(s.latest?.departure_at)}
                {s.source === 'osrm' && ' · no traffic: a reference, not a live time'}
                {s.source === 'operator-upload' && s.count === 0 && ' · upload operator trip logs to measure real journey times'}
              </div>
            </div>
          ))}
        </div>
      )}
      <div style={{ marginTop: 14 }}>
        <div className="eyebrow" style={{ marginBottom: 6 }}>Historical comparison — measured (operator) trips</div>
        {API_URL && obs.state === 'ok' && operatorPoints.length < 2 && (
          <div className="source-note">Not enough measured trips to plot a history for this pair ({operatorPoints.length}). OSRM free-flow values are constant and are not plotted as a traffic history.</div>
        )}
        {operatorPoints.length >= 2 && (
          <div style={{ height: 220 }}>
            <ResponsiveContainer>
              <LineChart data={operatorPoints} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
                <CartesianGrid stroke="rgba(225,235,228,0.06)" vertical={false} />
                <XAxis dataKey="t" type="number" domain={['dataMin', 'dataMax']} tickFormatter={(t) => formatIST(new Date(t).toISOString(), false)} tick={{ fill: '#6F7A73', fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: '#6F7A73', fontSize: 11 }} axisLine={false} tickLine={false} unit=" m" />
                <Tooltip {...tooltipStyle} labelFormatter={(t) => formatIST(new Date(Number(t)).toISOString())} formatter={(v) => [`${Number(v).toFixed(1)} min`, 'Observed']} />
                <Line dataKey="min" stroke="#8fd5a0" dot={{ r: 2 }} strokeWidth={1.4} isAnimationActive={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>
      {API_URL && (
        <div style={{ marginTop: 14 }}>
          <div className="eyebrow" style={{ marginBottom: 8 }}>On-demand estimate (not stored)</div>
          <div className="toolbar">
            <button className="btn sm" onClick={() => request('osrm')}><RefreshCw size={13} /> OSRM free-flow</button>
            <button className="btn sm" onClick={() => request('google-routes')}><RefreshCw size={13} /> Traffic-aware (Google)</button>
          </div>
          {(['osrm', 'google-routes'] as const).map((p) => {
            const r = est[`${pair}:${p}`];
            if (!r) return null;
            if (r === 'loading') return <div key={p} className="source-note" style={{ marginTop: 8 }}>Requesting {p}…</div>;
            if (r instanceof ApiError)
              return <div key={p} className="source-note" style={{ marginTop: 8 }}><DataBadge kind="UNAVAILABLE" /> {p}: {r.code === 'not_configured' ? 'not configured on the backend (MF_GOOGLE_MAPS_API_KEY)' : `${r.code} — ${r.message}`}</div>;
            return (
              <div key={p} className="fact" style={{ marginTop: 8 }}>
                <div className="k" style={{ display: 'flex', gap: 6, alignItems: 'center' }}>{r.traffic_aware ? 'Traffic-aware estimate · Google Routes' : 'Free-flow estimate · OSRM'} <DataBadge kind="ESTIMATED" /></div>
                <div className="v">{mins(r.duration_s)}{r.static_duration_s ? <span className="muted" style={{ fontSize: 12 }}> · without traffic {mins(r.static_duration_s)}</span> : null}</div>
                <div className="source-note" style={{ marginTop: 4 }}>Retrieved {formatIST(r.retrieved_at)} · {r.notes}</div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

function WeatherCard({ load }: { load: Load<Weather> }) {
  return (
    <section className="card card-pad">
      <div className="card-title">Weather · central Mumbai</div>
      <Unavailable load={load} what="Weather" />
      {load.state === 'ok' && !load.data.available && <div className="source-note" style={{ marginTop: 8 }}><DataBadge kind="UNAVAILABLE" /> {load.data.reason}</div>}
      {load.state === 'ok' && load.data.available && (
        <div style={{ marginTop: 8 }}>
          <div className="kv-row"><span>Open-Meteo (weather model)</span><DataBadge kind="ESTIMATED" freshness={load.data.freshness as 'fresh'} /></div>
          <div className="kv-row"><span className="muted">Temperature</span><span>{load.data.temperature_c ?? '—'} °C</span></div>
          <div className="kv-row"><span className="muted">Precipitation (15 min)</span><span>{load.data.precipitation_mm ?? '—'} mm</span></div>
          <div className="kv-row"><span className="muted">Wind</span><span>{load.data.wind_speed_kmh ?? '—'} km/h</span></div>
          <div className="kv-row"><span className="muted">Valid at</span><span>{formatIST(load.data.valid_at)}</span></div>
          <div className="source-note" style={{ marginTop: 6 }}>Weather data by Open-Meteo.com (CC BY 4.0). Model output, not a station reading.</div>
        </div>
      )}
    </section>
  );
}

function ForecastCard({ load }: { load: Load<ForecastStatus> }) {
  return (
    <section className="card card-pad">
      <div className="card-title">Journey-time forecast</div>
      <Unavailable load={load} what="Forecast status" />
      {load.state === 'ok' && load.data.status !== 'trained' && (
        <div style={{ marginTop: 8 }}>
          <div className="kv-row"><span>Status</span><DataBadge kind="UNAVAILABLE" title="No validated model" /></div>
          {(load.data.reasons ?? []).map((r) => <div key={r} className="kv-row"><span className="muted">{r}</span></div>)}
          {load.data.data_quality && <div className="kv-row"><span className="muted">Eligible measured trips</span><span>{load.data.data_quality.rows_usable} over {load.data.data_quality.distinct_days_ist} days</span></div>}
          <div className="source-note" style={{ marginTop: 6 }}>Only operator-recorded trips are eligible. OSRM free-flow times are constant and Google results may not be used for ML under Google's terms. No forecast is shown until a model beats or matches its baseline on held-out data.</div>
        </div>
      )}
      {load.state === 'ok' && load.data.status === 'trained' && load.data.test_metrics && (
        <div style={{ marginTop: 8 }}>
          <div className="kv-row"><span>Model {load.data.model_version}</span><DataBadge kind="FORECAST" /></div>
          {!load.data.requirements_met && <div className="source-note warn-t">Trained without meeting data requirements — not for operational use.</div>}
          <div className="kv-row"><span className="muted">Training period</span><span style={{ fontSize: 12 }}>{formatIST(load.data.training_period?.from)} → {formatIST(load.data.training_period?.to)}</span></div>
          <table className="data" style={{ marginTop: 8 }}>
            <thead><tr><th>Held-out test</th><th>MAE</th><th>RMSE</th><th>n</th></tr></thead>
            <tbody>
              {(['baseline', 'model'] as const).map((k) => (
                <tr key={k} style={{ cursor: 'default' }}><td>{k === 'baseline' ? 'Time-of-day baseline' : 'Gradient boosting'}{load.data.selected_predictor === k ? ' ✓' : ''}</td><td>{mins(load.data.test_metrics![k].mae_s)}</td><td>{mins(load.data.test_metrics![k].rmse_s)}</td><td>{load.data.test_metrics![k].n}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function RunsCard({ load, gtfs }: { load: Load<{ runs: Run[] }>; gtfs: Load<{ feeds: GtfsFeed[] }> }) {
  return (
    <section className="card card-pad wide">
      <div className="card-title">Ingestion history</div>
      <Unavailable load={load} what="Ingestion runs" />
      {load.state === 'ok' && load.data.runs.length === 0 && <Empty title="No ingestion runs yet" hint="Run the collectors in backend/ (see README)." />}
      {load.state === 'ok' && load.data.runs.length > 0 && (
        <div style={{ overflowX: 'auto', marginTop: 8 }}>
          <table className="data">
            <thead><tr><th>Started</th><th>Job</th><th>Status</th><th>Inserted</th><th>Duplicates</th><th>Invalid</th><th className="hide-mobile">Error</th></tr></thead>
            <tbody>
              {load.data.runs.map((r) => (
                <tr key={r.id} style={{ cursor: 'default' }}>
                  <td className="mono" style={{ fontSize: 12 }}>{formatIST(r.started_at)}</td>
                  <td>{r.job}</td>
                  <td className={r.status === 'success' ? 'ok-t' : r.status === 'failed' ? 'crit-t' : 'warn-t'}>{r.status}</td>
                  <td>{r.inserted}</td><td>{r.duplicates}</td><td>{r.invalid}</td>
                  <td className="hide-mobile muted" style={{ fontSize: 11.5, maxWidth: 380 }}>{r.error?.slice(0, 180)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div className="eyebrow" style={{ margin: '16px 0 6px' }}>GTFS schedules</div>
      {gtfs.state === 'ok' && gtfs.data.feeds.length === 0 && (
        <div className="source-note">No GTFS feed imported. No verified public Mumbai/BEST GTFS feed was found; the importer (python -m app.cli import-gtfs) validates any feed you are licensed to use. Schedules are never shown as live vehicle positions.</div>
      )}
      {gtfs.state === 'ok' && gtfs.data.feeds.map((f) => (
        <div key={f.id} className="kv-row"><span>{f.agency ?? 'Feed'} · {f.stops} stops · {f.routes} routes</span><span className="muted" style={{ fontSize: 12 }}>{f.feed_start_date} → {f.feed_end_date} · {f.license}</span></div>
      ))}
    </section>
  );
}

export default function DataPage() {
  const [health, reloadHealth] = useApi(() => api.health());
  const [sources, reloadSources] = useApi(() => api.sources());
  const [summary, reloadSummary] = useApi(() => api.journeySummary());
  const [weather] = useApi(() => api.weather());
  const [forecast] = useApi(() => api.forecast());
  const [runs, reloadRuns] = useApi(() => api.runs());
  const [gtfs] = useApi(() => api.gtfs());
  const refresh = () => (reloadHealth(), reloadSources(), reloadSummary(), reloadRuns());
  const backend = !API_URL ? 'Not configured — static mode' : health.state === 'ok' ? `Connected · database ${health.data.database}` : health.state === 'error' ? `Unreachable (${health.error.code})` : 'Connecting…';
  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Data Sources</h1>
          <p>Real data only. Nothing on this page comes from the demo simulation — each value is labelled Observed, Estimated or Forecast, with its source and time (shown in IST).</p>
        </div>
        <div className="toolbar">
          <span className="pill" title={API_URL ?? ''}><Database size={12} /> Backend: {backend}</span>
          {API_URL && <button className="btn sm" onClick={refresh}><RefreshCw size={13} /> Refresh</button>}
        </div>
      </div>
      <motion.div className="mode-banner" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
        <ShieldCheck size={16} />
        <span>Live Map, Fleet, Analytics, Incidents, Maintenance and Operations remain a <b>demo simulation</b> (<DataBadge kind="SIMULATED" />). Road geometry and the values below are real-world sourced.</span>
      </motion.div>
      <div className="data-grid">
        <SourcesCard load={sources} />
        <SnapshotCard />
        <WeatherCard load={weather} />
        <JourneyCard summary={summary} />
        <ForecastCard load={forecast} />
        <section className="card card-pad">
          <div className="card-title">Not available</div>
          <div className="kv-row"><span>Live vehicle positions</span><DataBadge kind="UNAVAILABLE" /></div>
          <div className="kv-row"><span>Passenger counts</span><DataBadge kind="UNAVAILABLE" /></div>
          <div className="kv-row"><span>Official traffic notices (Mumbai Traffic Police)</span><DataBadge kind="UNAVAILABLE" /></div>
          <div className="source-note" style={{ marginTop: 6 }}>No accessible, licensed feed was found for these. They stay simulated in demo mode and are never shown here as real.</div>
        </section>
        <RunsCard load={runs} gtfs={gtfs} />
      </div>
    </div>
  );
}
