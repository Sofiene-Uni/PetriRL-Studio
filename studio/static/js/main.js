// Router. URL: #/<page>/<arg>. A new page = a view module exporting async (root, arg) => cleanup + one line in ROUTES.
import { api } from "./core/api.js";
import { h } from "./core/dom.js";
import { langSwitch, loadLanguage, t, translateStatic } from "./core/i18n.js";
import { ensureLibrary, envOf, state } from "./core/state.js";
import { themeSwitch } from "./core/sim-theme.js";
import { toast } from "./core/ui.js";
import { benchmarksView } from "./views/benchmarks.js";
import { historyView } from "./views/history.js";
import { homeView } from "./views/home.js";
import { contentView } from "./views/page.js";
import { runView } from "./views/run.js";
import { solveView } from "./views/solve.js";
import { trainView } from "./views/train.js";

const ROUTES = {
  "": homeView,
  benchmarks: benchmarksView,
  solve: solveView,
  train: trainView,
  run: runView,
  history: historyView,
  technology: contentView("technology"),  // templates/pages/<lang>/technology.html
  about: contentView("about"),        // templates/pages/<lang>/about.html
  contact: contentView("contact"),    // templates/pages/<lang>/contact.html
};

const view = document.getElementById("view");
let cleanup = null;

async function route() {
  cleanup?.();
  cleanup = null;
  const [, page = "", arg] = (location.hash || "#/").split("/");
  const render = ROUTES[page] || ROUTES[""];
  document.querySelectorAll("[data-nav]").forEach((a) => a.classList.toggle("active", a.dataset.nav === page));
  view.replaceChildren(h("div", { class: "loading" }, t("Loading…")));
  try {
    const library = ensureLibrary().then(renderEnvChip);
    if (render !== homeView) await library;       // the home page draws its replay first and fills in the rest
    cleanup = (await render(view, arg)) || null;
  } catch (e) {
    view.replaceChildren(h("div", { class: "empty" }, h("b", {}, t("This page could not load")), e.message));
    toast(e.message, "error");
  }
  view.focus({ preventScroll: true });
  window.scrollTo(0, 0);
}

function renderEnvChip() {
  const chip = document.getElementById("env-chip");
  if (chip) {
    chip.textContent = `${t("Env")}: ${t(envOf(state.env).title)}`;
    chip.title = t("Environment for training and solving (change it on the home page)");
  }
}
document.addEventListener("envchange", renderEnvChip);

// visitor counter (shown on the About page): one visit per browser session, the browser keeps its own random id
// one visit per browser session, then the count is shown under the copyright in the footer
async function countVisit() {
  try {
    let id = localStorage.getItem("petrirl.visitor");
    if (!id) { id = crypto.randomUUID?.() || String(Math.random()).slice(2); localStorage.setItem("petrirl.visitor", id); }
    const first = !sessionStorage.getItem("petrirl.visited");
    sessionStorage.setItem("petrirl.visited", "1");
    const c = first ? await api("/api/visits", { json: { id } }) : await api("/api/visits");
    const el = document.getElementById("foot-visits");
    if (el) el.textContent = t("{visits} visits from {visitors} visitors", { visits: c.visits.toLocaleString(), visitors: c.visitors.toLocaleString() });
  } catch { /* the counter is optional */ }
}

// start: language first (the views use it), then the top bar, then the page
await loadLanguage();
translateStatic();
document.getElementById("lang-slot")?.append(langSwitch(h));
document.getElementById("theme-slot")?.append(themeSwitch());
countVisit();
addEventListener("hashchange", route);
route();
