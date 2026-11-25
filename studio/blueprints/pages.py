"""HTML pages. The front end is a single page app; its views are routed in static/js/main.js."""
from flask import Blueprint, render_template

pages_bp = Blueprint("pages", __name__)


@pages_bp.get("/")
def index():
    return render_template("index.html")
