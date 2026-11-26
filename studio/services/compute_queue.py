"""One line for all heavy work (solving and training).

At most SLOTS jobs compute at the same time; the others wait in arrival order and can ask for their place.
On a small server (one CPU core in a homelab container) this keeps the app responsive for everyone.
"""
import threading
from itertools import count

_cond = threading.Condition()
_waiting = []          # tickets in arrival order
_running = set()
_ids = count(1)
SLOTS, MAX_WAITING = 1, 20


class QueueFull(RuntimeError):
    pass


def configure(slots=1, max_waiting=20):
    global SLOTS, MAX_WAITING
    SLOTS, MAX_WAITING = max(1, int(slots)), max(0, int(max_waiting))


def join():
    """A ticket in the line (raises QueueFull when too many jobs wait already)."""
    with _cond:
        if len(_waiting) >= MAX_WAITING and len(_running) >= SLOTS:
            raise QueueFull(f"The server is busy: {len(_waiting)} jobs are waiting. Please try again in a few minutes.")
        ticket = next(_ids)
        _waiting.append(ticket)
        return ticket


def position(ticket):
    """1 = next in line, 0 = computing or not waiting."""
    with _cond:
        return _waiting.index(ticket) + 1 if ticket in _waiting else 0


def wait(ticket, cancelled=lambda: False):
    """Blocks until the ticket may compute. False if cancelled while waiting (the ticket then leaves the line)."""
    with _cond:
        while not (_waiting.index(ticket) < SLOTS - len(_running)):
            if cancelled():
                _waiting.remove(ticket)
                _cond.notify_all()
                return False
            _cond.wait(timeout=1.0)
        _waiting.remove(ticket)
        _running.add(ticket)
        return True


def leave(ticket):
    with _cond:
        _running.discard(ticket)
        if ticket in _waiting:
            _waiting.remove(ticket)
        _cond.notify_all()


def status():
    with _cond:
        return {"slots": SLOTS, "running": len(_running), "waiting": len(_waiting)}
