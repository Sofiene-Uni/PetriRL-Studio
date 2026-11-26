"""/api/solutions: replays of stored solutions (stock/solutions) and uploaded ones (machine orders or a firing sequence)."""
from flask import Blueprint, jsonify, request

from studio.services import episode_runner as runner

solutions_bp = Blueprint("solutions", __name__, url_prefix="/solutions")


@solutions_bp.post("/replay")
def replay():
    """Replays a solution on the Petri net and records it as a run: the stored one ({"instance_id"}) or an uploaded
    one ({"instance_id", "text", "name"})."""
    d = request.get_json(force=True)
    if not (d.get("text") or "").strip():
        return jsonify(runner.summary(runner.run(d["instance_id"], "solution:known")))
    rec = runner.run(d["instance_id"], None, solution={"text": d["text"], "name": (d.get("name") or "").strip()[:60]})
    return jsonify(runner.summary(rec))
