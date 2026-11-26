"""Stored solutions of benchmark instances, shipped with the app in stock/solutions (read-only, never downloaded).

One JSON file per instance: {"instance_id", "orders" (one job order per machine, 0-based jobs), "makespan",
"source", "url", "citation"}. Replaying one cites its source. Only add a file when its source allows it (see NOTICE).
"""
import os

from studio.services import storage

FOLDER = "solutions"


def _file(instance_id):
    return storage.stock(FOLDER, instance_id.replace(":", "_") + ".json")


def get(instance_id):
    f = _file(instance_id)
    return storage.read_json(f) if os.path.exists(f) else None


def has(instance_id):
    return os.path.exists(_file(instance_id))
