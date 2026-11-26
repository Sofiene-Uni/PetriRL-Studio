"""PetriRL Studio: Flask app factory."""
import os

from flask import Flask

from config import config_by_name
from studio.blueprints import register_blueprints
from studio.errors import register_error_handlers
from studio.services import agent_library, compute_queue, storage

__version__ = "0.7.0"


def create_app(config_name=None, **overrides):
    """config_name: development | production | testing (default: FLASK_CONFIG or development).
    overrides: single settings, e.g. create_app("testing", DATA_DIR=tmp_path)."""
    app = Flask(__name__)
    app.config.from_object(config_by_name[config_name or os.environ.get("FLASK_CONFIG", "development")])
    app.config.update(overrides)

    # ── Storage and stock content ─────────────────────────
    storage.init(app.config["DATA_DIR"], app.config["STOCK_DIR"])
    agent_library.seed_stock()              # benchmarks are read in place from STOCK_DIR/benchmarks
    compute_queue.configure(app.config["COMPUTE_SLOTS"], app.config["QUEUE_MAX"])

    # ── Blueprints and errors ─────────────────────────────
    register_blueprints(app)
    register_error_handlers(app)
    app.context_processor(lambda: {"version": __version__})
    return app
