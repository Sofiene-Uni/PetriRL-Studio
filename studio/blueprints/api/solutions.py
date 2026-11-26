"""/api/solutions: best known solutions (optimizizer.com for Taillard) and replays of uploaded solutions."""
from flask import Blueprint, jsonify, request

from studio.services import episode_runner as runner
from studio.services import known_solutions as known

solutions_bp = Blueprint("solutions", __name__, url_prefix="/solutions")


@solutions_bp.get("")
def list_solutions():
    return jsonify(known.list_all())


@solutions_bp.post("/fetch")
def fetch():
    """Downloads, checks and stores the optimizizer.com solutions of the given Taillard instances.
    Instances that already have a stored solution are not downloaded again."""
    ids = request.get_json(force=True).get("instance_ids", [])
    done = [known.summary(known.get(iid)) for iid in ids if known.has(iid)]
    missing = [iid for iid in ids if not known.has(iid)]
    bounds = known.taillard_bounds() if missing else {}
    failed = []
    for iid in missing:
        try:
            done.append(known.summary(known.fetch_taillard(iid, bounds)))
        except Exception as e:  # noqa: BLE001  (reported per instance)
            failed.append({"instance_id": iid, "error": str(e)})
    return jsonify(done=done, failed=failed)


@solutions_bp.post("/replay")
def replay():
    """Replays a solution on the Petri net and records it as a run: the stored best known one
    ({"instance_id"}) or an uploaded one ({"instance_id", "text", "name"})."""
    d = request.get_json(force=True)
    if d.get("text"):
        rec = runner.run(d["instance_id"], None, solution={"text": d["text"], "name": (d.get("name") or "").strip()[:60]})
    else:
        rec = runner.run(d["instance_id"], "solution:known")
    return jsonify(runner.summary(rec))
