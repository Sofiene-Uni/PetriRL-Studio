// Home: a live replay of a recorded episode and the two paths (solve / train), then the environment.
// The replay comes from a static file, so it starts before the library is loaded.
import { showcase } from "../components/showcase.js";
import { h } from "../core/dom.js";
import { contentPage, t } from "../core/i18n.js";
import { ensureLibrary, envOf, setEnv, state } from "../core/state.js";

const DEMO_URL = new URL("../../demo/home-run.json", import.meta.url);   // regenerate with tools/export_home_demo.py

export function homeView(root) {
  const stage = h("div", { class: "showcase-slot" });
  const envSlot = h("div", { class: "env-slot" });       // filled once the environments are loaded
  root.replaceChildren(heroSection(stage, envSlot));
  let show = null, gone = false;
  fetch(DEMO_URL).then((r) => r.json()).then((run) => {
    if (gone) return;
    show = showcase(run);
    stage.replaceChildren(show.el);
  }).catch(() => stage.remove());
  ensureLibrary().then(() => { if (!gone) { envSlot.replaceChildren(envSection()); root.append(homeFoot()); } });
  return () => { gone = true; show?.destroy(); };
}

function heroSection(stage, envSlot) {
  // the title and text are in templates/pages/<lang>/home.html (plain HTML, easy to edit)
  const text = h("div", { class: "hero-text" });
  contentPage("home").then((box) => text.prepend(...box.childNodes)).catch(() => {});
  // one grid: wide, the text sits next to the replay; narrow, text, doors and environment come before the replay
  return h("section", { class: "hero" }, text, stage, doors(), envSlot);
}

// the two paths, right under the hero
function doors() {
  return h("section", { class: "doors" },
    h("a", { class: "door", href: "#/solve" },
      h("h2", {}, t("Solve an instance")),
      h("p", {}, t("With your own agent, dispatching rules, metaheuristics, or replay a solution directly.")),
      doorIcon("solve")),
    h("a", { class: "door", href: "#/train" },
      h("h2", {}, t("Train an agent")),
      h("p", {}, t("Choose instances, reward and training budget, and follow the learning curve live.")),
      doorIcon("train")));
}

function homeFoot() {
  const count = (kind) => state.agents.filter((a) => a.kind === kind).length;
  return h("div", { class: "home-foot" },
    h("span", {}, h("b", {}, state.instances.filter((i) => i.source === "benchmark").length), " ", t("benchmark instances")),
    h("span", {}, h("b", {}, count("ppo")), " ", t("RL agents")),
    h("span", {}, h("b", {}, count("rule")), " ", t("dispatching rules")),
    h("span", {}, h("b", {}, count("meta")), " ", t("metaheuristics")));
}

// The environment decides what one agent action is; Train and Solve follow this choice.
function envSection() {
  // one card: title and dropdown on top (more environments will come), the chosen one explained below
  const select = h("select", { class: "env-select", "aria-label": t("Environment"),
    onchange: () => { setEnv(select.value); render(); } },
    ...state.envs.map((e) => h("option", { value: e.name }, t(e.title))));
  select.value = state.env;
  const body = h("div", { class: "env-body" });
  const render = () => {
    const e = envOf(state.env);
    body.replaceChildren(h("p", {}, t(e.description)), envFlow(e.name));
  };
  render();
  return h("section", { class: "env-card" },
    h("div", { class: "env-head" },
      h("div", {}, h("h2", {}, t("Environment")),
        h("p", {}, t("Available: {list}", { list: state.envs.map((e) => t(e.title)).join(", ") }))),
      select),
    body);
}

// a small picture of one agent step in the env
function envFlow(name) {
  const tok = (txt, cls = "") => h("span", { class: `flow-tok ${cls}` }, txt);
  const arrow = () => h("span", { class: "flow-arrow", "aria-hidden": "true" });
  if (name === "hyper") {
    return h("div", { class: "flow" }, tok("state"), arrow(), tok("agent", "agent"), arrow(), tok("MTWR", "rule"), arrow(),
      h("span", { class: "flow-group" }, tok("J3", "job"), tok("J1", "job"), tok("J5", "job"), h("small", {}, "k decisions")));
  }
  if (name === "or_informed") {
    return h("div", { class: "flow" }, tok(t("tabu search"), "rule"), arrow(), tok("clone"), arrow(), tok("PPO"), arrow(),
      tok("agent", "agent"), arrow(), tok("J3", "job"), h("small", {}, t("or wait")));
  }
  return h("div", { class: "flow" }, tok("state"), arrow(), tok("agent", "agent"), arrow(), tok("J3", "job"), h("small", {}, t("or wait")));
}

function doorIcon(kind) {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 72 72");
  svg.setAttribute("class", "door-icon");
  svg.innerHTML = kind === "solve"
    ? `<g fill="none" stroke="currentColor" stroke-width="2.2" opacity=".9"><rect x="8" y="14" width="30" height="9" rx="3" fill="currentColor" opacity=".9"/><rect x="24" y="29" width="38" height="9" rx="3"/><rect x="14" y="44" width="22" height="9" rx="3" fill="currentColor" opacity=".55"/><line x1="44" y1="8" x2="44" y2="62" stroke-dasharray="3 3"/></g>`
    : `<g fill="none" stroke="currentColor" stroke-width="2.2"><path d="M8 58 C22 56 24 30 36 28 S52 18 64 14"/><circle cx="20" cy="50" r="2.4" fill="currentColor"/><circle cx="31" cy="36" r="2.4" fill="currentColor"/><circle cx="45" cy="25" r="2.4" fill="currentColor"/><circle cx="58" cy="17" r="2.4" fill="currentColor"/><line x1="8" y1="64" x2="64" y2="64" opacity=".4"/></g>`;
  return svg;
}
