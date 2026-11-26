"""/api/train: start, follow and stop background training jobs."""
from flask import Blueprint, current_app, jsonify, request

from studio.services import training_jobs as trainer

training_bp = Blueprint("training", __name__, url_prefix="/train")


@training_bp.post("")
def start_training():
    cfg = current_app.config
    return jsonify(trainer.start(request.get_json(force=True), cfg["TRAIN_MAX_STEPS"], cfg["TRAIN_MAX_ENVS"]))


@training_bp.get("")
def list_training():
    return jsonify(trainer.list_jobs())


@training_bp.get("/<jid>")
def training_state(jid):
    since_ep, since_log = int(request.args.get("since_ep", 0)), int(request.args.get("since_log", 0))
    return jsonify(trainer.get(jid).state(since_ep, since_log))


@training_bp.post("/<jid>/cancel")
def cancel_training(jid):
    job = trainer.get(jid)
    job.cancel = True
    job.log("stop requested, saving the best checkpoint")
    return jsonify(ok=True)


@training_bp.post("/<jid>/milestone")
def save_milestone(jid):
    job = trainer.get(jid)
    if job.status != "running":
        return jsonify(error="Milestones can only be saved while training runs"), 409
    job.milestone = True
    return jsonify(ok=True)
