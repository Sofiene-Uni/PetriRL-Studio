"""Public demo mode (PETRIRL_PUBLIC=1): visitors share one library, so changes that affect others are refused,
and what visitors leave (uploaded instances, runs, trained agents) is deleted after KEEP_HOURS and at every start."""
import os
import threading
import time

from flask import current_app

from studio.services import episode_runner, storage

KEEP_HOURS = 24
VISITOR_FOLDERS = ("instances", "runs", "agents")


def is_public():
    return bool(current_app.config.get("PUBLIC"))


def refuse(what):
    """Raises 403 on the public demo for actions that change or remove shared things."""
    if is_public():
        raise PermissionError(f"{what} is turned off on this public demo")


def purge(max_age_hours=KEEP_HOURS):
    """Deletes visitor files older than max_age_hours (0: all of them). Stock agents and the run index stay."""
    cutoff = time.time() - max_age_hours * 3600
    stock = storage.stock("agents")
    keep = {os.path.splitext(f)[0] for f in os.listdir(stock)} if os.path.isdir(stock) else set()
    for folder in VISITOR_FOLDERS:
        path = storage.path(folder)
        for name in os.listdir(path) if os.path.isdir(path) else []:
            file = os.path.join(path, name)
            if name == episode_runner.INDEX or os.path.splitext(name)[0] in keep or not os.path.isfile(file):
                continue
            if os.path.getmtime(file) <= cutoff:
                os.remove(file)
    episode_runner.drop_missing()


def start_cleaner():
    """Empties the visitor folders now, then deletes old visitor files every hour."""
    purge(0)

    def loop():
        while True:
            time.sleep(3600)
            purge()
    threading.Thread(target=loop, name="public-cleaner", daemon=True).start()
