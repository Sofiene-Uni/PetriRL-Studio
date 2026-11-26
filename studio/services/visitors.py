"""Visit counter, kept in DATA_DIR (in Docker: the host data folder, so it survives image rebuilds).

Only a number is stored: no IP address, no id, no cookie and nothing kept in the browser."""
import os
import threading

from studio.services import storage

FILE = "visitors.json"
_lock = threading.Lock()


def _load():
    file = storage.path(FILE)
    return storage.read_json(file) if os.path.exists(file) else {"visits": 0}


def counts():
    with _lock:
        return {"visits": _load()["visits"]}


def visit():
    """Counts one visit."""
    with _lock:
        d = {"visits": _load()["visits"] + 1}
        storage.write_json(storage.path(FILE), d)
    return d
