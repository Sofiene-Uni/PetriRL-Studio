"""JSON API under /api. Each resource is its own blueprint, registered below."""
from flask import Blueprint, jsonify

from engine.core import STANDBY_MODES
from engine.envs import ENVS
from engine.policies import RULES
from studio.blueprints.api.agents import agents_bp
from studio.blueprints.api.benchmarks import benchmarks_bp
from studio.blueprints.api.instances import instances_bp
from studio.blueprints.api.runs import runs_bp
from studio.blueprints.api.training import training_bp

api_bp = Blueprint("api", __name__, url_prefix="/api")

for bp in (instances_bp, benchmarks_bp, agents_bp, runs_bp, training_bp):
    api_bp.register_blueprint(bp)


@api_bp.get("/envs")
def envs():
    """Environments an agent can be trained in: title, description, extra options."""
    return jsonify([{"name": c.name, "title": c.title, "description": c.description, "options": c.options,
                     "supports_standby": c.supports_standby, "problem_types": list(c.problem_types),
                     "fixed_actions": c.fixed_actions}
                    for c in ENVS.values()])


@api_bp.get("/health")
def health():
    """What this server offers: environments, dispatching rules, standby modes."""
    return jsonify(status="ok", envs=list(ENVS), rules=list(RULES), standby_modes=STANDBY_MODES)
