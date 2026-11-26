import subprocess
import sys
from pathlib import Path


def test_every_js_module_imports_what_it_uses():
    script = Path(__file__).resolve().parents[1] / "tools" / "check_js_imports.py"
    r = subprocess.run([sys.executable, str(script)], capture_output=True, text=True)
    assert r.returncode == 0, r.stdout
def test_version_in_footer(client):
    from studio import __version__
    assert f"v{__version__}".encode() in client.get("/").data


def test_content_pages_are_readable_without_javascript(client):
    """Search engines get each content page with its text, title, description and language links."""
    for path, lang, words in (("/", "en", "The power of"), ("/de/", "de", "Die Kraft"), ("/technology", "en", "PetriRL"),
                              ("/de/about", "de", "Team"), ("/contact", "en", "research demonstrator"), ("/de/privacy", "de", "netcup")):
        html = client.get(path).get_data(as_text=True)
        assert f'<html lang="{lang}"' in html and words in html, path
        assert '<meta name="description"' in html and 'hreflang="de"' in html and 'rel="canonical"' in html
    assert client.get("/nothing-here").status_code == 404
    robots = client.get("/robots.txt").get_data(as_text=True)
    assert "Disallow: /api/" in robots and "sitemap.xml" in robots
    sitemap = client.get("/sitemap.xml").get_data(as_text=True)
    assert sitemap.count("<url>") == 10 and "/de/privacy" in sitemap
    assert "<script src=\"http" not in client.get("/").get_data(as_text=True)      # no outside scripts


def test_privacy_page_shows_the_operator_from_the_settings(tmp_path):
    from studio import create_app
    c = create_app("testing", DATA_DIR=str(tmp_path), OPERATOR_ADDRESS="Musterweg 1, 59494 Soest",
                   OPERATOR_EMAIL="a@b.de").test_client()
    html = c.get("/de/privacy").get_data(as_text=True)
    assert "Musterweg 1, 59494 Soest" in html and "mailto:a@b.de" in html and "Datenschutz" in html


def test_nothing_is_stored_in_the_browser():
    import pathlib
    root = pathlib.Path(__file__).resolve().parents[1] / "studio"
    files = [*root.glob("static/js/**/*.js"), *root.glob("templates/**/*.html")]
    assert not [f.name for f in files if any(w in f.read_text() for w in ("localStorage", "sessionStorage", "document.cookie"))]


def test_static_files_get_a_new_address_per_version(client):
    import re
    html = client.get("/").get_data(as_text=True)
    js = re.search(r'src="(/a/\w+/js/main\.js)"', html).group(1)
    r = client.get(js)
    assert r.status_code == 200 and r.cache_control.max_age == 365 * 24 * 3600
    assert client.get(js.replace("main.js", "core/i18n.js")).status_code == 200      # relative imports follow
