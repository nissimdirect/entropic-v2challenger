"""SG-7 codec timeout — bounded-time wrapper for PyAV `av.open`.

PyAV can hang for minutes on malformed input (bad header, corrupted index,
truncated stream). The Python interpreter cannot interrupt a C-level blocking
call from another thread, so this module runs `av.open` in a daemon worker
thread and unblocks the caller via `Thread.join(timeout)`.

On timeout: raises `CodecTimeoutError`. The worker thread is left running as
a daemon; it will eventually complete or hang until the process exits.

See `docs/decisions/q7/DEC-Q7-003-codec-timeout-mechanism.md` for the full
rationale and considered alternatives.
"""

from __future__ import annotations

import queue
import threading
from typing import Any

import av

DEFAULT_DECODE_TIMEOUT_SECONDS = 5.0


class CodecTimeoutError(Exception):
    """Raised when a decode operation exceeds the timeout."""

    def __init__(self, asset_path: str, operation: str, elapsed_s: float):
        self.asset_path = asset_path
        self.operation = operation
        self.elapsed_s = elapsed_s
        super().__init__(
            f"Decode timeout: {operation} on {asset_path} exceeded {elapsed_s:.1f}s"
        )


def _av_open_worker(path: str, mode: str, kwargs: dict, result_q: queue.Queue) -> None:
    try:
        container = av.open(path, mode=mode, **kwargs)  # type: ignore[call-overload]
        result_q.put(("ok", container))
    except BaseException as exc:  # noqa: BLE001
        # Propagate all errors (including FileNotFoundError, InvalidDataError,
        # ValueError, PermissionError) to the caller thread via the queue.
        result_q.put(("err", exc))


def av_open_timeout(
    path: str,
    *,
    mode: str = "r",
    timeout_s: float = DEFAULT_DECODE_TIMEOUT_SECONDS,
    **kwargs: Any,
) -> Any:
    """Drop-in `av.open` replacement with a hard timeout.

    Parameters
    ----------
    path : str
        The asset path to open.
    mode : str, optional
        PyAV mode string. Default 'r' for read; 'w' for write.
    timeout_s : float, optional
        Hard timeout in seconds. Default DEFAULT_DECODE_TIMEOUT_SECONDS (5.0).
    **kwargs
        Forwarded to `av.open` (e.g., `options={'rtsp_transport': 'tcp'}`).

    Returns
    -------
    av.container.Container
        Same as `av.open`.

    Raises
    ------
    CodecTimeoutError
        If `av.open` takes longer than `timeout_s`. The worker thread is left
        running as a daemon and will be reaped on process exit.
    Exception
        Any exception raised by `av.open` itself (FileNotFoundError,
        InvalidDataError, ValueError, etc.) is re-raised in the caller.
    """
    result_q: queue.Queue = queue.Queue(maxsize=1)
    # Limit name length to keep thread inspection readable (macOS truncates).
    worker_name = f"av-open-{path[-30:]}"
    worker = threading.Thread(
        target=_av_open_worker,
        args=(path, mode, kwargs, result_q),
        name=worker_name,
        daemon=True,
    )
    worker.start()
    worker.join(timeout_s)
    if worker.is_alive():
        raise CodecTimeoutError(path, "av.open", timeout_s)

    kind, value = result_q.get_nowait()
    if kind == "err":
        raise value  # type: ignore[misc]
    return value  # type: ignore[return-value]
