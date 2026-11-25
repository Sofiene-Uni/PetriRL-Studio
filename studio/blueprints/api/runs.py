"""/api/solve and /api/runs: solve instance x agent pairs, read recorded episodes, export plans."""
import csv
import io

from flask import Blueprint, Response, current_app, jsonify, request

from studio.services import agent_library as agents
from studio.services import episode_runner as runner
from studio.services import instance_library as instances

runs_bp = Blueprint("runs", __name__)
_demo = {}


@runs_bp.post("/solve")
def solve():
    """Every selected agent on every selected instance; pairs of different sizes are reported, not run."""
    d = request.get_json(force=True)
    det, seed = bool(d.get("deterministic", True)), int(d.get("seed", 0))
    results, skipped = [], []
    for iid in d.get("instance_ids", []):
        inst = instances.get(iid)
        for aid in d.get("agent_ids", []):
            agent = agents.get(aid)
            if not agents.compatible(agent, inst):
                skipped.append({"instance": inst["name"], "agent": agent["name"],
                                "reason": f"agent is {agent['n_jobs']}x{agent['n_machines']}, "
                                          f"instance is {inst['n_jobs']}x{inst['n_machines']}"})
                continue
            results.append(runner.run(iid, aid, deterministic=det, seed=seed))
    return jsonify(results=results, skipped=skipped)


@runs_bp.get("/demo")
def demo():
    """Replay for the home page: the demo instance with the first fitting learned agent (a rule if none)."""
    if "run" not in _demo:
        iid = current_app.config["DEMO_INSTANCE"]
        inst = instances.get(iid)
        fits = [a for a in agents.list_all() if a["kind"] != "rule" and agents.compatible(a, inst)]
        _demo["run"] = runner.run(iid, fits[0]["id"] if fits else "rule:LPSR", save=False)
    return jsonify(_demo["run"])


@runs_bp.get("/runs")
def list_runs():
    return jsonify(runner.list_recent())


@runs_bp.get("/runs/<rid>")
def get_run(rid):
    return jsonify(runner.get(rid))


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
