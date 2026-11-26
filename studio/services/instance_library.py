"""Instance library: benchmarks (read-only catalog), uploads (drag and drop) and random instances.

Every instance has a reference value for the gap:
    optimum      best known = proven lower bound (literature, or your own value)
    best known   best known solution from the literature, or a value you entered
    lower bound  no known solution: max(longest job, busiest machine)
An upload with the same operations as a benchmark gets that benchmark's values.
"""
import os

from engine.instances import Instance, InstanceError, parse_instance, random_instance, to_text
from studio.services import benchmark_catalog as benchmarks
from studio.services import storage

FOLDER = "instances"
OVERRIDES = "reference_overrides.json"
SOURCE_ORDER = {"benchmark": 0, "upload": 1, "random": 2}


def _file(iid):
    return storage.path(FOLDER, f"{storage.slug(iid)}.json")


# ---------------------------------------------------------------- reference values
def _overrides():
    path = storage.path(OVERRIDES)
    return storage.read_json(path) if os.path.exists(path) else {}


def reference(rec):
    lit = rec.get("literature")
    matched = None
    if lit is None and rec.get("matches"):
        matched = benchmarks.record(rec["matches"])
        lit = matched["literature"]
    lower = max(rec["lb"], lit["lower_bound"] if lit else 0)
    own = _overrides().get(rec["id"])
    if own is not None:
        value, source = own, "your value"
    elif lit:
        value, source = lit["best_known"], lit["best_known_ref"]
    else:
        return {"value": rec["lb"], "kind": "lower bound", "lower_bound": rec["lb"],
                "source": "computed: longest job or busiest machine"}
    out = {"value": value, "kind": "optimum" if value <= lower else "best known", "lower_bound": lower, "source": source}
    if matched:
        out["matched"] = matched["name"]
    return out


def set_reference(iid, value):
    """Your own best known value (e.g. from a paper you cite); None removes it."""
    rec = get(iid)
    overrides = _overrides()
    if value is None:
        overrides.pop(iid, None)
    else:
        value = int(value)
        lower = public(rec)["reference"]["lower_bound"]
        if value < lower:
            raise ValueError(f"{value} is below the lower bound {lower}: that schedule cannot exist")
        overrides[iid] = value
    storage.write_json(storage.path(OVERRIDES), overrides)
    return public(get(iid))


# ---------------------------------------------------------------- records
def _record(iid, name, sequences, n_machines, source, fmt):
    inst = Instance(sequences, n_machines, name=name)
    rec = {"id": iid, "name": name, "source": source, "format": fmt, "problem_type": "jssp",
           "created": storage.now(), "sequences": inst.base_sequences, **inst.summary()}
    storage.write_json(_file(iid), rec)
    return public(rec)


def public(rec):
    out = {k: v for k, v in rec.items() if k != "sequences"}
    if "sequences" in rec and rec["source"] != "benchmark":
        out["matches"] = rec["matches"] = benchmarks.match(rec["sequences"])
    out.setdefault("problem_type", "jssp")
    out["reference"] = reference(rec)
    return out


def _user_records():
    return [r for r in storage.list_json(FOLDER) if r.get("source") in ("upload", "random")]


def list_all():
    recs = [public(r) for r in benchmarks.records()] + [public(r) for r in _user_records()]
    return sorted(recs, key=lambda r: SOURCE_ORDER.get(r["source"], 9))


def get(iid):
    """Full record, with the operations."""
    if benchmarks.is_benchmark(iid):
        rec = benchmarks.record(iid)
        rec["sequences"], _ = benchmarks.sequences(iid)
        return rec
    if not os.path.exists(_file(iid)):
        raise KeyError(f"instance {iid} not found")
    return storage.read_json(_file(iid))


def get_public(iid):
    return public(get(iid))


def load(iid):
    if benchmarks.is_benchmark(iid):
        return benchmarks.load(iid)
    rec = get(iid)
    return Instance(rec["sequences"], rec["n_machines"], name=rec["name"])


def add_text(name, text):
    """Parses an uploaded file. Raises InstanceError with a readable message."""
    seq, nm, fmt = parse_instance(text)
    name = os.path.splitext(os.path.basename(name or "instance"))[0][:40] or "instance"
    return _record(storage.new_id("up"), name, seq, nm, "upload", fmt)


def add_random(n_jobs, n_machines, p_min=1, p_max=99, seed=None):
    if not (2 <= n_jobs <= 100 and 2 <= n_machines <= 50):
        raise InstanceError("size must be 2..100 jobs and 2..50 machines")
    if not 1 <= p_min <= p_max <= 999:
        raise InstanceError("process times must satisfy 1 <= min <= max <= 999")
    seq = random_instance(n_jobs, n_machines, p_min, p_max, seed)
    return _record(storage.new_id("rnd"), f"rand_{n_jobs}x{n_machines}", seq, n_machines, "random", "generated")


def delete(iid):
    if benchmarks.is_benchmark(iid):
        raise PermissionError("benchmark instances cannot be deleted")
    get(iid)
    os.remove(_file(iid))


def as_text(iid):
    rec = get(iid)
    return to_text(rec["sequences"], rec["n_machines"])
