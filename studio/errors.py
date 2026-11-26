"""Error handlers: API routes answer JSON {"error": message}, pages keep Flask's HTML errors."""
from flask import jsonify, request
from werkzeug.exceptions import HTTPException

from engine.instances import InstanceError
from studio.services.compute_queue import QueueFull


def _is_api():
    return request.path.startswith("/api/")


def register_error_handlers(app):
    def json_error(status):
        def handler(e):
            if not _is_api():
                raise e
            msg = str(e.args[0]) if isinstance(e, KeyError) and e.args else str(e)
            return jsonify(error=msg), status
        return handler

    app.register_error_handler(KeyError, json_error(404))
    app.register_error_handler(InstanceError, json_error(400))
    app.register_error_handler(ValueError, json_error(400))
    app.register_error_handler(PermissionError, json_error(403))
    app.register_error_handler(QueueFull, json_error(503))

    @app.errorhandler(HTTPException)
    def http_error(e):
        if _is_api():
            return jsonify(error=e.description), e.code
        return e
