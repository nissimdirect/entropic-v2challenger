"""SG-7 codec-timeout telemetry (deferred from PR #2 SG-7).

Counts every CodecTimeoutError so we can surface it via:
- Stats endpoint for observability (added to existing /stats response)
- Optional Sentry breadcrumb when sentry_sdk is configured
- Stderr log line in any case

Per [[feedback_sdlc-verify-in-app-not-just-code]]: this is observed
through the existing telemetry UI; tests verify increment + breadcrumb
emission.
"""

from __future__ import annotations

import logging
import threading
import time
from dataclasses import dataclass, field
from typing import Optional

logger = logging.getLogger(__name__)


@dataclass
class CodecTimeoutEvent:
    """One recorded codec timeout."""

    asset_path: str
    operation: str
    elapsed_s: float
    occurred_at_s: float = field(default_factory=time.time)


@dataclass
class CodecTimeoutCounter:
    """Counts + remembers recent codec timeouts.

    Thread-safe. Bounded history (default 32 events) so we don't OOM
    even if a malicious source triggers a flood.
    """

    total: int = 0
    history: list[CodecTimeoutEvent] = field(default_factory=list)
    history_limit: int = 32
    _lock: threading.RLock = field(default_factory=threading.RLock, repr=False)

    def record(self, asset_path: str, operation: str, elapsed_s: float) -> None:
        event = CodecTimeoutEvent(
            asset_path=asset_path, operation=operation, elapsed_s=elapsed_s
        )
        with self._lock:
            self.total += 1
            self.history.append(event)
            if len(self.history) > self.history_limit:
                # FIFO drop the oldest
                self.history = self.history[-self.history_limit :]

        # Always log
        logger.warning(
            "SG-7 codec timeout: operation=%s asset=%s elapsed=%.2fs (total session: %d)",
            operation,
            asset_path,
            elapsed_s,
            self.total,
        )

        # Optional Sentry breadcrumb
        try:
            import sentry_sdk  # type: ignore[import-not-found]
        except ImportError:
            return

        try:
            sentry_sdk.add_breadcrumb(
                category="sg-7",
                level="warning",
                message=f"codec timeout: {operation}",
                data={
                    "asset_path": asset_path,
                    "elapsed_s": elapsed_s,
                    "session_total": self.total,
                },
            )
        except Exception:  # noqa: BLE001
            # Sentry not configured / disabled / errored — never block
            pass

    def stats(self) -> dict:
        with self._lock:
            return {
                "total": self.total,
                "recent": [
                    {
                        "asset_path": e.asset_path,
                        "operation": e.operation,
                        "elapsed_s": round(e.elapsed_s, 3),
                        "occurred_at_s": e.occurred_at_s,
                    }
                    for e in self.history[-10:]  # last 10 for terseness
                ],
            }

    def reset(self) -> None:
        with self._lock:
            self.total = 0
            self.history.clear()


_GLOBAL: Optional[CodecTimeoutCounter] = None


def global_codec_telemetry() -> CodecTimeoutCounter:
    global _GLOBAL
    if _GLOBAL is None:
        _GLOBAL = CodecTimeoutCounter()
    return _GLOBAL


def reset_global_codec_telemetry_for_testing() -> None:
    global _GLOBAL
    _GLOBAL = None
