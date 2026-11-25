"""Benchmark catalog (read-only, shipped in stock/benchmarks): problem types -> families -> instances,
with the literature lower bound and best known solution of each instance.

Instance ids are "<problem type>:<name>", e.g. "jssp:ta01".
"""
import hashlib
import json
import os
from functools import lru_cache

from engine.instances import Instance, compute_scales, parse_instance
from studio.services import storage


def _root(*parts):
    return storage.stock("benchmarks", *parts)


@lru_cache(maxsize=1)
def catalog():
    path = _root("catalog.json")
    if not os.path.exists(path):
        return {"problem_types": {}, "references": {}, "source": None}
    with open(path) as f:
        return json.load(f)


def fingerprint(sequences):
    """Same operations (machine, time) in the same order = same instance; tools are ignored."""
    data = [[[int(m), int(p)] for m, _, p in job] for job in sequences]
    return hashlib.sha1(json.dumps(data).encode()).hexdigest()


def _ref(key):
    return catalog()["references"].get(key, {}).get("short", key)


@lru_cache(maxsize=1)
def _index():
    """id -> record (without sequences), plus the fingerprint index. Built once, from the files."""
    records, by_fp = {}, {}
    for ptype, pt in catalog()["problem_types"].items():
        for fam in pt["families"]:
            for it in fam["instances"]:
                with open(_root(ptype, fam["id"], f"{it['name']}.txt")) as f:
                    seq, nm, _ = parse_instance(f.read())
                iid = f"{ptype}:{it['name']}"
                rec = {"id": iid, "name": it["name"], "source": "benchmark", "problem_type": ptype,
                       "family": fam["id"], "family_name": f"{fam['name']} ({fam['year']})",
                       "n_jobs": len(seq), "n_machines": nm, "n_ops": sum(len(j) for j in seq),
                       "lb": compute_scales(seq)["lb"],
                       "literature": {"lower_bound": it["lower_bound"], "best_known": it["best_known"],
                                      "optimal": it["optimal"], "lower_bound_ref": _ref(it["lower_bound_ref"]),
                                      "best_known_ref": _ref(it["best_known_ref"])}}
                if "original_name" in it:
                    rec["original_name"] = it["original_name"]
                records[iid] = rec
                by_fp[fingerprint(seq)] = iid
    return records, by_fp


def is_benchmark(iid):
    return iid in _index()[0]


def records():
    return list(_index()[0].values())


def record(iid):
    return dict(_index()[0][iid])


def sequences(iid):
    rec = _index()[0][iid]
    with open(_root(rec["problem_type"], rec["family"], f"{rec['name']}.txt")) as f:
        seq, nm, _ = parse_instance(f.read())
    return seq, nm


def load(iid):
    seq, nm = sequences(iid)
    return Instance(seq, nm, name=record(iid)["name"])


def match(sequences_):
    """Benchmark id with the same operations, or None."""
    return _index()[1].get(fingerprint(sequences_))


def tree():
    """For the Benchmarks page: problem types -> families -> instance ids."""
    out = []
    for ptype, pt in catalog()["problem_types"].items():
        out.append({"id": ptype, "name": pt["name"], "description": pt["description"], "families": [
            {"id": f["id"], "name": f["name"], "year": f["year"], "reference": f["reference"],
             "instances": [f"{ptype}:{i['name']}" for i in f["instances"]]} for f in pt["families"]]})
    return {"problem_types": out, "source": catalog().get("source")}
