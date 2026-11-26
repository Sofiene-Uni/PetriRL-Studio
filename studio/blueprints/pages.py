"""HTML pages. The app is a single page app (views routed in static/js/main.js), but the content pages have real
addresses (/, /technology, /about, /contact and /de/...) and are served with their text in the HTML, so search
engines can read them.

Text that should be easy to edit lives in two places, both one file per page:
- templates/pages/<lang>/<page>.html   whole content pages (home hero, about, contact), plain HTML
- i18n/<lang>/<page>.json              translations of the app's labels: {"English text": "translation"}
Titles and descriptions for search engines are in studio/seo.py.
"""
import json
import os

from flask import Blueprint, Response, abort, current_app, jsonify, render_template
from jinja2 import TemplateNotFound

from studio import seo

pages_bp = Blueprint("pages", __name__)
LANGS = ("en", "de")
I18N_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "i18n")


def _dictionary(lang):
    folder, merged = os.path.join(I18N_DIR, lang), {}
    if os.path.isdir(folder):
        for name in sorted(os.listdir(folder)):
            if name.endswith(".json"):
                with open(os.path.join(folder, name), encoding="utf-8") as f:
                    merged.update(json.load(f))
    return merged


@pages_bp.app_context_processor
def server_translation():
    """tr("Solve") in templates: the top bar is already in the page's language when served (for search engines)."""
    def tr(text, lang="en"):
        return _dictionary(lang).get(text, text) if lang != "en" else text
    return {"tr": tr}


def _page(page, lang):
    if page not in seo.PAGES:
        abort(404)
    site = current_app.config["SITE_URL"]
    title, description = seo.META[lang][page]
    return render_template("index.html", page=page, lang=lang, title=title, description=description,
                           canonical=site + seo.path(page, lang),
                           alternates={code: site + seo.path(page, code) for code in LANGS},
                           content=f"pages/{lang}/{page}.html")


@pages_bp.get("/")
def index():
    return _page("home", "en")


@pages_bp.get("/de/")
def index_de():
    return _page("home", "de")


@pages_bp.get("/<page>")
def page_en(page):
    return _page(page, "en")


@pages_bp.get("/de/<page>")
def page_de(page):
    return _page(page, "de")


@pages_bp.get("/robots.txt")
def robots():
    site = current_app.config["SITE_URL"]
    return Response(f"User-agent: *\nDisallow: /api/\nAllow: /\n\nSitemap: {site}/sitemap.xml\n", mimetype="text/plain")


@pages_bp.get("/sitemap.xml")
def sitemap():
    site = current_app.config["SITE_URL"]
    urls = []
    for page in seo.PAGES:
        links = "".join(f'<xhtml:link rel="alternate" hreflang="{c}" href="{site}{seo.path(page, c)}"/>' for c in LANGS)
        for lang in LANGS:
            urls.append(f"<url><loc>{site}{seo.path(page, lang)}</loc>{links}</url>")
    xml = ('<?xml version="1.0" encoding="UTF-8"?>\n'
           '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">'
           + "".join(urls) + "</urlset>\n")
    return Response(xml, mimetype="application/xml")


@pages_bp.get("/i18n/<lang>.json")
def translations(lang):
    """All translation files of a language merged (English needs none: the English text is the key)."""
    if lang not in LANGS:
        abort(404)
    return jsonify(_dictionary(lang))


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
