"""File storage of the app: JSON records and binary files under DATA_DIR, read-only stock under STOCK_DIR.
init() is called once by the app factory (or by a script) before any service is used."""
import json
import os
import re
import threading
import uuid
from datetime import datetime

_paths = {"data": None, "stock": None}
_lock = threading.Lock()


def init(data_dir, stock_dir):
    _paths["data"], _paths["stock"] = data_dir, stock_dir
    for sub in ("instances", "agents", "runs"):
        os.makedirs(os.path.join(data_dir, sub), exist_ok=True)


def path(*parts):
    if _paths["data"] is None:
        raise RuntimeError("storage.init() was not called")
    return os.path.join(_paths["data"], *parts)


def stock(*parts):
    return os.path.join(_paths["stock"], *parts)


def new_id(prefix):
    return f"{prefix}_{uuid.uuid4().hex[:8]}"


def slug(text, default="item"):
    s = re.sub(r"[^A-Za-z0-9_.-]+", "-", str(text)).strip("-.")
    return s[:48] or default


def now():
    return datetime.now().isoformat(timespec="seconds")


def write_json(file, obj):
    os.makedirs(os.path.dirname(file), exist_ok=True)
    tmp = file + ".tmp"
    with _lock:
        with open(tmp, "w") as f:
            json.dump(obj, f, separators=(",", ":"))
        os.replace(tmp, file)


def read_json(file):
    with open(file) as f:
        return json.load(f)


def list_json(folder):
    folder = path(folder)
    os.makedirs(folder, exist_ok=True)
    out = []
    for name in os.listdir(folder):
        if name.endswith(".json"):
            try:
                out.append(read_json(os.path.join(folder, name)))
            except (OSError, ValueError):
                pass
    return out
