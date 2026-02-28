import os
import platform
import sys
from pathlib import Path

import sentry_sdk

from _version import __version__
from diagnostics import init_diagnostics
from security import strip_pii
from zmq_server import ZMQServer

# Consent-gated Sentry init (VULN-11)
_consent_path = os.path.expanduser("~/.entropic/telemetry_consent")
_dsn = ""
if os.path.exists(_consent_path) and Path(_consent_path).read_text().strip() == "yes":
    _dsn = os.environ.get("SENTRY_DSN", "")

sentry_sdk.init(
    dsn=_dsn,
    release=f"entropic@{__version__}",
    environment=os.environ.get("SENTRY_ENV", "development"),
    traces_sample_rate=0.1,
    before_send=strip_pii,
    max_breadcrumbs=50,
)

# SEC-9: Resource limits (Linux/macOS only)
MAX_MEMORY_BYTES = 4 * 1024 * 1024 * 1024  # 4 GB


def _apply_resource_limits():
    """Apply SEC-9 memory limits. Skipped on Windows."""
    if platform.system() == "Windows":
        return
    try:
        import resource

        soft, hard = resource.getrlimit(resource.RLIMIT_AS)
        resource.setrlimit(resource.RLIMIT_AS, (MAX_MEMORY_BYTES, hard))
    except (ImportError, ValueError, OSError):
        # resource module not available or limit can't be set
        print("WARNING: Could not set memory limit (SEC-9)", file=sys.stderr)


def main():
    init_diagnostics()
    _apply_resource_limits()
    server = ZMQServer()
    print(f"ZMQ_PORT={server.port}", flush=True)
    print(f"ZMQ_PING_PORT={server.ping_port}", flush=True)
    print(f"ZMQ_TOKEN={server.token}", flush=True)
    server.run()


if __name__ == "__main__":
    main()
