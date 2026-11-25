"""/api/agents: stock, trained and uploaded agents, plus dispatching rules."""
from flask import Blueprint, jsonify, request, send_file

from studio.services import agent_library as agents

agents_bp = Blueprint("agents", __name__, url_prefix="/agents")


@agents_bp.get("")
def list_agents():
    return jsonify(agents.list_all())


@agents_bp.post("")
def upload_agent():
    f = request.files.get("file")
    if f is None or not f.filename.endswith(".zip"):
        raise ValueError("upload the agent as the .zip file saved by stable-baselines3")
    return jsonify(agents.upload(f, request.form.get("name"), request.form.get("env") or None))


@agents_bp.patch("/<aid>")
def update_agent(aid):
    """Body: {"name": ..., "standby": "on" | "gt"} (both optional)."""
    d = request.get_json(force=True)
    return jsonify(agents.update(aid, name=d.get("name"), standby=d.get("standby")))


@agents_bp.delete("/<aid>")
def delete_agent(aid):
    agents.delete(aid)
    return jsonify(ok=True)


@agents_bp.get("/<aid>/download")
def download_agent(aid):
    meta = agents.get(aid)
    return send_file(agents.zip_file(aid), as_attachment=True, download_name=f"{meta['name']}.zip")
