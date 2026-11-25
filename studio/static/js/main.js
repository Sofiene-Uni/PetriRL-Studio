// Router. URL: #/<page>/<arg>. A new page = a view module exporting async (root, arg) => cleanup + one line in ROUTES.
import { h } from "./core/dom.js";
import { envOf, refreshLibrary, state } from "./core/state.js";
import { toast } from "./core/ui.js";
import { benchmarksView } from "./views/benchmarks.js";
import { historyView } from "./views/history.js";
import { homeView } from "./views/home.js";
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
};

const view = document.getElementById("view");
let cleanup = null;

async function route() {
  cleanup?.();
  cleanup = null;
  const [, page = "", arg] = (location.hash || "#/").split("/");
  const render = ROUTES[page] || ROUTES[""];
  document.querySelectorAll("[data-nav]").forEach((a) => a.classList.toggle("active", a.dataset.nav === page));
  view.replaceChildren(h("div", { class: "loading" }, "Loading…"));
  try {
    if (!state.instances.length) { await refreshLibrary(); renderEnvChip(); }
    cleanup = (await render(view, arg)) || null;
  } catch (e) {
    view.replaceChildren(h("div", { class: "empty" }, h("b", {}, "This page could not load"), e.message));
    toast(e.message, "error");
  }
  view.focus({ preventScroll: true });
  window.scrollTo(0, 0);
}

function renderEnvChip() {
  const chip = document.getElementById("env-chip");
  if (chip) chip.textContent = `Env: ${envOf(state.env).title}`;
}
document.addEventListener("envchange", renderEnvChip);

addEventListener("hashchange", route);
route();
