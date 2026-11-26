"""Best known solutions of benchmark instances.

Two places: STOCK_DIR/solutions ships with the app (filled once with tools/fetch_known_solutions.py), and
DATA_DIR/solutions holds the ones downloaded later (kept across Docker rebuilds). A solution is fetched only once.
Taillard solutions come from optimizizer.com (maintained by Oleg Shylo): the server downloads one, checks it by
replaying it on the Petri net, and stores it with its source so every replay can cite it.
"""
import json
import os
import re
import urllib.request

from engine.policies.metaheuristics import decode_wait
from engine.policies.solutions import parse, sequence_from_machine_orders
from studio.services import instance_library as instances
from studio.services import storage

FOLDER = "solutions"
INDEX_URL = "https://optimizizer.com/TA.php"
SOLUTION_URL = "https://optimizizer.com/solution.php?name={name}&UB={ub}&problemclass=ta"
CITATION = ("Solution from optimizizer.com, the job shop bounds and solutions page maintained by Oleg Shylo "
            "(https://optimizizer.com/TA.php)")


def _name(instance_id):
    return instance_id.replace(":", "_") + ".json"


def _file(instance_id):
    return storage.path(FOLDER, _name(instance_id))


def _found(instance_id):
    """The stored file: downloaded here first, else shipped with the app."""
    for f in (_file(instance_id), storage.stock(FOLDER, _name(instance_id))):
        if os.path.exists(f):
            return f
    return None


def get(instance_id):
    f = _found(instance_id)
    return storage.read_json(f) if f else None


def has(instance_id):
    return _found(instance_id) is not None


def jobs_of(instance_id):
    inst = instances.load(instance_id)
    return inst, [[(m, p) for m, _, p in job] for job in inst.job_sequences]


def save(instance_id, text, source, url=None, citation=None):
    """Checks a solution (machine orders) on the instance and stores it; returns the stored record."""
    inst, jobs = jobs_of(instance_id)
    kind, rows = parse(text, jobs, inst.n_machines)
    if kind != "machines":
        raise ValueError("a best known solution must be given as machine orders")
    makespan = decode_wait(jobs, sequence_from_machine_orders(rows, jobs))
    rec = {"instance_id": instance_id, "orders": rows, "makespan": makespan, "source": source, "url": url,
           "citation": citation, "retrieved": storage.now()}
    os.makedirs(storage.path(FOLDER), exist_ok=True)
    storage.write_json(_file(instance_id), rec)
    return rec


def _download(url, timeout=20):
    req = urllib.request.Request(url, headers={"User-Agent": "PetriRL-Studio (research; cites optimizizer.com)"})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return r.read().decode("utf-8", "replace")


def taillard_bounds():
    """{"ta01": 1231, ...}: the upper bound of each Taillard instance with a solution link on optimizizer.com."""
    html = _download(INDEX_URL)
    return {m[0]: int(m[1]) for m in re.findall(r"solution\.php\?name=(ta\d+)&(?:amp;)?UB=(\d+)", html)}


def fetch_taillard(instance_id, bounds=None):
    """Downloads, checks and stores the optimizizer.com solution of a Taillard instance (e.g. "jssp:ta01")."""
    name = instances.get(instance_id)["name"]
    if not re.fullmatch(r"ta\d+", name):
        raise ValueError(f"{name}: optimizizer.com solutions are available for the Taillard instances only")
    bounds = bounds or taillard_bounds()
    if name not in bounds:
        raise ValueError(f"optimizizer.com has no solution file for {name} yet")
    url = SOLUTION_URL.format(name=name, ub=bounds[name])
    text = re.sub(r"<[^>]+>", "\n", _download(url))           # the solution page is HTML: keep the number rows
    rec = save(instance_id, text, "optimizizer.com", url=url, citation=CITATION)
    if rec["makespan"] != bounds[name]:
        os.remove(_file(instance_id))
        raise ValueError(f"{name}: the downloaded solution replays to {rec['makespan']}, the page says {bounds[name]}")
    return rec


def summary(rec):
    return {k: rec[k] for k in ("instance_id", "makespan", "source", "url", "citation", "retrieved")}


def list_all():
    files = {}
    for folder in (storage.stock(FOLDER), storage.path(FOLDER)):          # downloaded ones override shipped ones
        if os.path.isdir(folder):
            files.update({f: os.path.join(folder, f) for f in os.listdir(folder) if f.endswith(".json")})
    out = []
    for name in sorted(files):
        with open(files[name]) as fh:
            out.append(summary(json.load(fh)))
    return out
