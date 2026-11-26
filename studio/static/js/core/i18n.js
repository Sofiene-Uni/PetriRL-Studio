// Two languages. The English text is the key: t("Solve an instance") returns the German translation from
// studio/i18n/de/*.json (one file per page) or the English text when there is none.
// Variables: t("Solve {n} selected", { n: 3 }). The language is saved in the browser; switching reloads the page.
const KEY = "petrirl.lang";
export const LANGS = [["en", "EN"], ["de", "DE"]];
let dict = {};

export function lang() {
  try {
    const saved = localStorage.getItem(KEY);
    if (saved === "en" || saved === "de") return saved;
  } catch { /* private mode */ }
  return (navigator.language || "en").toLowerCase().startsWith("de") ? "de" : "en";
}

export async function loadLanguage() {
  document.documentElement.lang = lang();
  if (lang() === "en") return;
  try { dict = await (await fetch(`/i18n/${lang()}.json`)).json(); } catch { dict = {}; }
}

export function t(text, vars) {
  let out = dict[text] ?? text;
  if (vars) for (const [k, v] of Object.entries(vars)) out = out.replaceAll(`{${k}}`, v);
  return out;
}

export function setLang(code) {
  try { localStorage.setItem(KEY, code); } catch { /* private mode */ }
  location.reload();
}

// server-rendered parts (top bar, footer): <a data-t>Solve</a> gets its translation
export function translateStatic(root = document) {
  root.querySelectorAll("[data-t]").forEach((el) => { el.textContent = t(el.dataset.t || el.textContent.trim()); });
}

// the EN | DE switch in the top bar
export function langSwitch(h) {
  return h("div", { class: "lang-switch", role: "group", "aria-label": "Language" },
    ...LANGS.flatMap(([code, label], i) => [
      i ? h("span", { class: "sep", "aria-hidden": "true" }, "|") : null,
      h("button", { type: "button", class: code === lang() ? "on" : "", "aria-pressed": code === lang(),
        onclick: () => code !== lang() && setLang(code) }, label)]).filter(Boolean));
}

// a content page from templates/pages/<lang>/<name>.html
export async function contentPage(name) {
  const r = await fetch(`/pages/${lang()}/${name}`);
  if (!r.ok) throw new Error(`page ${name} not found`);
  const box = document.createElement("div");
  box.innerHTML = await r.text();
  return box;
}
