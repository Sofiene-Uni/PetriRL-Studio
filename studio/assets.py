"""Static files under an address that changes with their content: /a/<build>/js/main.js.
A new version gets new addresses, so browsers and caches never run an old copy, and unchanged files can be
cached for a year. Relative paths (JS imports, fonts in CSS) follow the same build automatically."""
import hashlib
import os

from flask import send_from_directory

YEAR = 365 * 24 * 3600


def init(app):
    folder = app.static_folder
    digest = hashlib.sha1()
    for root, dirs, files in os.walk(folder):
        dirs.sort()
        for name in sorted(files):
            file = os.path.join(root, name)
            digest.update(os.path.relpath(file, folder).encode())
            with open(file, "rb") as f:
                digest.update(f.read())
    build = digest.hexdigest()[:10]

    @app.get("/a/<build_id>/<path:filename>")
    def asset_file(build_id, filename):
        return send_from_directory(folder, filename, max_age=YEAR)

    app.context_processor(lambda: {"asset": lambda path: f"/a/{build}/{path}"})
