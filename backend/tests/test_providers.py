import httpx
import pytest

from app.providers.google_routes import parse_google_routes
from app.providers.http import MinIntervalLimiter, ProviderError, RetryPolicy, request_with_retry
from app.providers.open_meteo import parse_open_meteo
from app.providers.osrm import parse_osrm
from app.provenance import DataKind


def test_osrm_parse_ok():
    est = parse_osrm({"code": "Ok", "routes": [{"duration": 300.5, "distance": 4000, "geometry": {"coordinates": [[72.83, 19.05], [72.86, 19.06]]}}]})
    assert est.kind is DataKind.ESTIMATED and not est.traffic_aware
    assert est.geometry == [(19.05, 72.83), (19.06, 72.86)]
    assert est.storable and not est.ml_eligible


@pytest.mark.parametrize("payload", [{"code": "NoRoute", "message": "x"}, {"code": "Ok", "routes": []}, {"code": "Ok", "routes": [{"duration": 0, "distance": 1, "geometry": {"coordinates": [[1, 2], [3, 4]]}}]}, {"code": "Ok", "routes": [{"distance": 1}]}, []])
def test_osrm_parse_rejects_bad(payload):
    with pytest.raises(ProviderError) as e:
        parse_osrm(payload)
    assert e.value.kind == "invalid_response"


def test_google_parse_and_usage_rights():
    est = parse_google_routes({"routes": [{"duration": "1534s", "staticDuration": "1200s", "distanceMeters": 9100}]})
    assert est.duration_s == 1534 and est.extra["static_duration_s"] == 1200
    assert est.traffic_aware and est.kind is DataKind.ESTIMATED
    assert not est.storable and not est.ml_eligible and not est.map_display_allowed and est.geometry is None


def test_google_parse_bad_duration():
    with pytest.raises(ProviderError):
        parse_google_routes({"routes": [{"duration": "abc"}]})


def test_open_meteo_parse():
    w = parse_open_meteo({"latitude": 19.07, "longitude": 72.88, "utc_offset_seconds": 0, "current": {"time": "2026-10-27T15:15", "temperature_2m": 31.1, "weather_code": 3}})
    assert w.valid_at.isoformat() == "2026-10-27T15:15:00+00:00"
    assert w.kind is DataKind.ESTIMATED and w.temperature_c == 31.1 and w.weather_code == 3 and w.rain_mm is None


@pytest.mark.parametrize("payload", [{"error": True, "reason": "bad"}, {"latitude": 1, "longitude": 2}, {"latitude": 1, "longitude": 2, "utc_offset_seconds": 19800, "current": {"time": "2026-10-27T15:15"}}])
def test_open_meteo_rejects(payload):
    with pytest.raises(ProviderError):
        parse_open_meteo(payload)


def _client(responses):
    it = iter(responses)

    def handler(req):
        r = next(it)
        if isinstance(r, Exception):
            raise r
        return r

    return httpx.Client(transport=httpx.MockTransport(handler))


def test_retry_then_success():
    sleeps = []
    c = _client([httpx.Response(503), httpx.Response(200, json={})])
    r = request_with_retry(c, "x", "GET", "https://x.test", policy=RetryPolicy(2, 0.5), sleep=sleeps.append)
    assert r.status_code == 200 and sleeps == [0.5]


def test_timeout_is_reported():
    c = _client([httpx.ReadTimeout("slow"), httpx.ReadTimeout("slow")])
    with pytest.raises(ProviderError) as e:
        request_with_retry(c, "x", "GET", "https://x.test", policy=RetryPolicy(1, 0), sleep=lambda s: None)
    assert e.value.kind == "timeout"


def test_unreachable_and_non_retryable():
    c = _client([httpx.ConnectError("refused")])
    with pytest.raises(ProviderError) as e:
        request_with_retry(c, "x", "GET", "https://x.test", policy=RetryPolicy(0, 0), sleep=lambda s: None)
    assert e.value.kind == "unreachable"
    c = _client([httpx.Response(403, text="forbidden")])
    with pytest.raises(ProviderError) as e:
        request_with_retry(c, "x", "GET", "https://x.test", policy=RetryPolicy(3, 0), sleep=lambda s: None)
    assert e.value.kind == "http_error" and e.value.status_code == 403


def test_rate_limited_after_retries():
    c = _client([httpx.Response(429, headers={"retry-after": "1"}), httpx.Response(429)])
    slept = []
    with pytest.raises(ProviderError) as e:
        request_with_retry(c, "x", "GET", "https://x.test", policy=RetryPolicy(1, 0), sleep=slept.append)
    assert e.value.kind == "rate_limited" and slept == [1.0]


def test_min_interval_limiter():
    t = [0.0]
    slept = []
    lim = MinIntervalLimiter(1.0, sleep=lambda s: (slept.append(s), t.__setitem__(0, t[0] + s)), clock=lambda: t[0])
    lim.wait()
    lim.wait()
    assert slept == [1.0]
