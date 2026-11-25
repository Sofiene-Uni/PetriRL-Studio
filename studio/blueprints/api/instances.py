"""/api/instances: library, drag-and-drop upload, random instances, download."""
from flask import Blueprint, Response, jsonify, request

from engine.instances import InstanceError
from studio.services import instance_library as instances

instances_bp = Blueprint("instances", __name__, url_prefix="/instances")


@instances_bp.get("")
def list_instances():
    return jsonify(instances.list_all())


@instances_bp.post("")
def upload_instances():
    """Several files at once; each file is parsed on its own and errors are reported per file."""
    added, errors = [], []
    for f in request.files.getlist("files"):
        try:
            added.append(instances.add_text(f.filename, f.read().decode("utf-8", errors="replace")))
        except (InstanceError, ValueError) as e:
            errors.append({"file": f.filename, "error": str(e)})
    return jsonify(added=added, errors=errors)


@instances_bp.post("/random")
def random_instance():
    d = request.get_json(force=True)
    return jsonify(instances.add_random(int(d.get("n_jobs", 6)), int(d.get("n_machines", 6)),
                                        int(d.get("p_min", 1)), int(d.get("p_max", 99)), d.get("seed")))


@instances_bp.get("/<iid>")
def get_instance(iid):
    """The instance with its operations (sequences: per job, [machine, tool, time] with machines from 1)."""
    return jsonify({**instances.get_public(iid), "sequences": instances.get(iid)["sequences"]})


@instances_bp.patch("/<iid>")
def set_reference(iid):
    """Body: {"best_known": value} to use your own best known value (null to go back to the literature)."""
    return jsonify(instances.set_reference(iid, request.get_json(force=True).get("best_known")))


@instances_bp.get("/<iid>/download")
def download_instance(iid):
    rec = instances.get(iid)
    return Response(instances.as_text(iid), mimetype="text/plain",
                    headers={"Content-Disposition": f"attachment; filename={rec['name']}.txt"})


@instances_bp.delete("/<iid>")
def delete_instance(iid):
    instances.delete(iid)
    return jsonify(ok=True)
