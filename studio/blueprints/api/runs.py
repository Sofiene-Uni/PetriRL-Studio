"""/api/solve and /api/runs: solve jobs (instance x agent pairs), recorded episodes, plan export."""
import csv
import io

from flask import Blueprint, Response, jsonify, request

from studio.services import episode_runner as runner
from studio.services import solve_jobs

runs_bp = Blueprint("runs", __name__)


@runs_bp.post("/solve")
def solve():
    """Starts a solve job (every selected agent on every selected instance); poll it with GET /api/solve/<id>."""
    d = request.get_json(force=True)
    return jsonify(solve_jobs.start(d.get("instance_ids", []), d.get("agent_ids", []),
                                    bool(d.get("deterministic", True)), int(d.get("seed", 0)), d.get("params")))


@runs_bp.get("/solve/<jid>")
def solve_state(jid):
    """queued (with the place in line), running (with progress), done (with results) or failed."""
    return jsonify(solve_jobs.get(jid).state())


@runs_bp.get("/runs")
def list_runs():
    return jsonify(runner.list_recent())


@runs_bp.get("/runs/<rid>")
def get_run(rid):
    return jsonify(runner.get(rid))


@runs_bp.get("/runs/<rid>/solution.txt")
def solution_txt(rid):
    """The run as a solution file: ?format=machines (machine orders) or firing (with waits)."""
    from engine.policies.solutions import export
    rec = runner.get(rid)
    machines, firing = export(rec["schedule"], rec["decisions"], rec["instance"]["n_machines"])
    fmt = request.args.get("format", "machines")
    name = f"{fmt}_{rec['instance']['name']}_{rec['agent']['name']}.txt".replace(" ", "_")
    return Response(machines if fmt == "machines" else firing, mimetype="text/plain",
                    headers={"Content-Disposition": f"attachment; filename={name}"})


@runs_bp.get("/runs/<rid>/plan.csv")
def plan_csv(rid):
    rec = runner.get(rid)
    buf = io.StringIO()
    w = csv.writer(buf)
    w.writerow(["machine", "job", "operation", "start", "end", "duration"])
    for r in rec["schedule"]:
        w.writerow([r["machine"], r["job"], r["rank"], r["start"], r["end"], r["p"]])
    name = f"plan_{rec['instance']['name']}_{rec['agent']['name']}.csv".replace(" ", "_")
    return Response(buf.getvalue(), mimetype="text/csv", headers={"Content-Disposition": f"attachment; filename={name}"})
