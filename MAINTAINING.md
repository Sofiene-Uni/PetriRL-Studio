# Maintaining PetriRL Studio

## Change a text page (home hero, Technology, About, Contact)

Edit plain HTML, one file per page and language:

```
studio/templates/pages/en/<page>.html
studio/templates/pages/de/<page>.html
```

No build step. Reload the browser.

## Add a new page

1. Create `studio/templates/pages/en/<name>.html` and `studio/templates/pages/de/<name>.html`.
2. In `studio/static/js/main.js`, add one line to `ROUTES`: `<name>: contentView("<name>"),`
3. In `studio/templates/partials/topbar.html`, add a link:
   `<a href="#/<name>" data-route="<name>" data-t>Name</a>`
   (left `nav-info` for information pages, right `nav-app` for app pages)
4. Add the German link text to `studio/i18n/de/layout.json`.

## Translate app texts

English text is the key. In JavaScript, wrap a text with `t()`:

```js
t("Solve")                              // plain text
t("{n} of {total} steps", { n, total }) // with variables
```

German goes in `studio/i18n/de/<page>.json` (any file; they are merged):

```json
{ "{n} of {total} steps": "{n} von {total} Schritten" }
```

Keep every `{placeholder}`. A missing translation shows the English text.
`pytest tests/test_i18n.py` lists every text that has no German translation yet.

Static HTML in templates uses `data-t`: `<a data-t>About</a>` is translated on load.

## Where things are

| What | Where |
|---|---|
| Top bar, footer | `studio/templates/partials/` |
| Text pages | `studio/templates/pages/<lang>/` |
| German texts | `studio/i18n/de/` |
| App views (Solve, Train, Run, …) | `studio/static/js/views/` |
| Shared UI parts | `studio/static/js/components/` |
| Styles | `studio/static/css/` |
| API | `studio/blueprints/api/` |
| Envs, rules, metaheuristics | `engine/` |

## Check before shipping

```
python -m pytest -q
python tools/check_js_imports.py
```

## Best known solutions (Taillard, optimizizer.com)

A solution is downloaded only once. To ship all of them with the app (so nobody has to fetch them), run once:

```
python tools/fetch_known_solutions.py      # stores them in stock/solutions
```

The app reads `stock/solutions` (shipped) and `DATA_DIR/solutions` for the ones fetched later.
