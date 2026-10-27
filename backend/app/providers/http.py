"""HTTP helper: timeouts, bounded retries with backoff, and a polite per-provider rate limiter."""
from __future__ import annotations

import threading
import time
from dataclasses import dataclass

import httpx


class ProviderError(Exception):
    """A provider call failed. `kind` is one of:
    not_configured, rate_limited, quota_exceeded, timeout, unreachable, http_error, invalid_response."""

    def __init__(self, provider: str, kind: str, message: str, status_code: int | None = None):
        super().__init__(f"{provider}: {kind}: {message}")
        self.provider = provider
        self.kind = kind
        self.message = message
        self.status_code = status_code

    def to_dict(self) -> dict:
        return {"provider": self.provider, "error": self.kind, "message": self.message}


class MinIntervalLimiter:
    """Ensures at least `min_interval_s` between calls (thread-safe, in-process)."""

    def __init__(self, min_interval_s: float, sleep=time.sleep, clock=time.monotonic):
        self.min_interval_s = min_interval_s
        self._sleep = sleep
        self._clock = clock
        self._last = -1e18
        self._lock = threading.Lock()

    def wait(self) -> None:
        with self._lock:
            delta = self._clock() - self._last
            if delta < self.min_interval_s:
                self._sleep(self.min_interval_s - delta)
            self._last = self._clock()


@dataclass
class RetryPolicy:
    retries: int = 2
    backoff_s: float = 0.8


RETRYABLE_STATUS = {429, 500, 502, 503, 504}


def request_with_retry(
    client: httpx.Client,
    provider: str,
    method: str,
    url: str,
    *,
    policy: RetryPolicy,
    sleep=time.sleep,
    **kwargs,
) -> httpx.Response:
    last_exc: ProviderError | None = None
    for attempt in range(policy.retries + 1):
        try:
            resp = client.request(method, url, **kwargs)
        except httpx.TimeoutException as e:
            last_exc = ProviderError(provider, "timeout", str(e) or "request timed out")
        except httpx.TransportError as e:
            last_exc = ProviderError(provider, "unreachable", str(e) or e.__class__.__name__)
        else:
            if resp.status_code < 400:
                return resp
            kind = "rate_limited" if resp.status_code == 429 else "http_error"
            last_exc = ProviderError(provider, kind, f"HTTP {resp.status_code}: {resp.text[:200]}", resp.status_code)
            if resp.status_code not in RETRYABLE_STATUS:
                raise last_exc
            retry_after = resp.headers.get("retry-after")
            if retry_after and retry_after.isdigit() and attempt < policy.retries:
                sleep(min(float(retry_after), 30.0))
                continue
        if attempt < policy.retries:
            sleep(policy.backoff_s * (2**attempt))
    assert last_exc is not None
    raise last_exc
