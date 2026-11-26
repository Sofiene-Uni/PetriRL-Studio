"""All blueprints. A new feature = a new module (page or API) + one line here."""
from studio.blueprints.api import api_bp
from studio.blueprints.pages import pages_bp


def register_blueprints(app):
    app.register_blueprint(pages_bp)
    app.register_blueprint(api_bp)          # /api/...
