"""Both languages stay complete: every t("...") text of the front end has a German translation, every
{placeholder} survives the translation, and every content page exists in both languages."""
import glob
import json
import os
import re

ROOT = os.path.join(os.path.dirname(os.path.dirname(__file__)), "studio")


def german():
    out = {}
    for f in glob.glob(os.path.join(ROOT, "i18n", "de", "*.json")):
        with open(f, encoding="utf-8") as fh:
            out.update(json.load(fh))
    return out


def test_every_text_is_translated():
    de = german()
    missing = []
    for f in glob.glob(os.path.join(ROOT, "static", "js", "**", "*.js"), recursive=True):
        if f.endswith("i18n.js"):
            continue
        for m in re.finditer(r'\bt\("((?:[^"\\]|\\.)*)"', open(f, encoding="utf-8").read()):
            if m.group(1) not in de:
                missing.append(f"{os.path.basename(f)}: {m.group(1)}")
    assert not missing, "add to studio/i18n/de/<page>.json:\n" + "\n".join(missing)


# extra variables a translation may use (German says "Platz {n}" where English says "{nth} in line")
EXTRA = {"Sorry, the server is busy. You are {nth} in line.": {"{n}"}}


def test_placeholders_survive():
    for en, de in german().items():
        assert set(re.findall(r"\{\w+\}", de)) <= set(re.findall(r"\{\w+\}", en)) | EXTRA.get(en, set()), en


def test_content_pages_in_both_languages(client):
    pages = {os.path.basename(f) for f in glob.glob(os.path.join(ROOT, "templates", "pages", "en", "*.html"))}
    assert pages == {os.path.basename(f) for f in glob.glob(os.path.join(ROOT, "templates", "pages", "de", "*.html"))}
    for lang in ("en", "de"):
        for page in pages:
            assert client.get(f"/pages/{lang}/{page[:-5]}").status_code == 200
    assert client.get("/i18n/de.json").get_json()["Solve"] == "Lösen"
