import platform
import sys

from zmq_server import ZMQServer

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
    _apply_resource_limits()
    server = ZMQServer()
    print(f"ZMQ_PORT={server.port}", flush=True)
    server.run()


if __name__ == "__main__":
    main()
