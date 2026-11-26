"""Visitor counter, kept in DATA_DIR (in Docker: the studio-data volume, so it survives image rebuilds).

visits: one per browser session; visitors: distinct browsers. A browser sends a random id it keeps itself;
only a hash of it is stored (no IP address, no cookie set by the server)."""
import hashlib
import os
import threading

from studio.services import storage

FILE = "visitors.json"
_lock = threading.Lock()


def _load():
    file = storage.path(FILE)
    return storage.read_json(file) if os.path.exists(file) else {"visits": 0, "ids": []}


def counts():
    with _lock:
        d = _load()
    return {"visits": d["visits"], "visitors": len(d["ids"])}


def visit(browser_id):
    """Counts one visit; a new browser id also counts as a new visitor."""
    key = hashlib.sha256(str(browser_id)[:64].encode()).hexdigest()[:16]
    with _lock:
        d = _load()
        d["visits"] += 1
        if key not in d["ids"]:
            d["ids"].append(key)
        storage.write_json(storage.path(FILE), d)
    return {"visits": d["visits"], "visitors": len(d["ids"])}
