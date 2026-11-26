"""/api/instances: library, drag-and-drop upload, random instances, download."""
from flask import Blueprint, Response, current_app, jsonify, request

from engine.instances import InstanceError
from studio.services import instance_library as instances
from studio.services.public_mode import is_public, refuse

instances_bp = Blueprint("instances", __name__, url_prefix="/instances")


@instances_bp.get("")
def list_instances():
    from studio.services import known_solutions as known
    return jsonify([{**i, "known_solution": known.has(i["id"])} for i in instances.list_all()])


@instances_bp.post("")
def upload_instances():
    """Several files at once; each file is parsed on its own and errors are reported per file."""
    added, errors = [], []
    files = request.files.getlist("files")
    if is_public():
        if len(files) > 10:
            raise ValueError("upload at most 10 files at a time")
        if sum(i["source"] == "upload" for i in instances.list_all()) >= current_app.config["PUBLIC_MAX_UPLOADS"]:
            raise PermissionError("the demo holds enough uploaded instances; please try again later")
    for f in files:
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
    """Body: {"best_known": value} to use your own best known value (null removes it)."""
    refuse("Changing best known values")
    return jsonify(instances.set_reference(iid, request.get_json(force=True).get("best_known")))


@instances_bp.get("/<iid>/download")
def download_instance(iid):
    rec = instances.get(iid)
    return Response(instances.as_text(iid), mimetype="text/plain",
                    headers={"Content-Disposition": f"attachment; filename={rec['name']}.txt"})


@instances_bp.delete("/<iid>")
def delete_instance(iid):
    refuse("Deleting instances")
    instances.delete(iid)
    return jsonify(ok=True)
