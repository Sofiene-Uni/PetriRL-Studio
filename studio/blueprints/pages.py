"""HTML pages. The front end is a single page app; its views are routed in static/js/main.js.

Text that should be easy to edit lives in two places, both one file per page:
- templates/pages/<lang>/<page>.html   whole content pages (home hero, about, contact), plain HTML
- i18n/<lang>/<page>.json              translations of the app's labels: {"English text": "translation"}
"""
import json
import os

from flask import Blueprint, abort, jsonify, render_template
from jinja2 import TemplateNotFound

pages_bp = Blueprint("pages", __name__)
LANGS = ("en", "de")
I18N_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "i18n")


@pages_bp.get("/")
def index():
    return render_template("index.html")


@pages_bp.get("/i18n/<lang>.json")
def translations(lang):
    """All translation files of a language merged (English needs none: the English text is the key)."""
    if lang not in LANGS:
        abort(404)
    folder, merged = os.path.join(I18N_DIR, lang), {}
    if os.path.isdir(folder):
        for name in sorted(os.listdir(folder)):
            if name.endswith(".json"):
                with open(os.path.join(folder, name), encoding="utf-8") as f:
                    merged.update(json.load(f))
    return jsonify(merged)


@pages_bp.get("/pages/<lang>/<name>")
def content_page(lang, name):
    """A content page fragment (templates/pages/<lang>/<name>.html), English if not translated."""
    if lang not in LANGS or not name.isidentifier():
        abort(404)
    for candidate in (lang, "en"):
        try:
            return render_template(f"pages/{candidate}/{name}.html")
        except TemplateNotFound:
            continue
    abort(404)
