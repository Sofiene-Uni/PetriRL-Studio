"""/api/benchmarks: the benchmark catalog by problem type and family, with your best run per instance."""
from flask import Blueprint, jsonify

from studio.services import benchmark_catalog as catalog
from studio.services import episode_runner as runner
from studio.services import instance_library as instances

benchmarks_bp = Blueprint("benchmarks", __name__, url_prefix="/benchmarks")


@benchmarks_bp.get("")
def list_benchmarks():
    tree, best = catalog.tree(), runner.best_by_instance()
    for ptype in tree["problem_types"]:
        for fam in ptype["families"]:
            fam["instances"] = [{**instances.public(catalog.record(iid)), "best_run": _best(best.get(iid))}
                                for iid in fam["instances"]]
    return jsonify(tree)


def _best(s):
    return None if s is None else {k: s[k] for k in ("id", "makespan", "gap", "agent", "created")}
