// Home: the two paths (solve / train) and a live replay of a real episode.
import { Gantt } from "../components/gantt.js";
import { PetriPlayer } from "../components/petri-player.js";
import { api } from "../core/api.js";
import { h } from "../core/dom.js";
import { followSimTheme, simThemeName, themeSwitch } from "../core/sim-theme.js";
import { setEnv, state } from "../core/state.js";

export async function homeView(root) {
  const learned = state.agents.filter((a) => a.kind !== "rule");
  const stage = h("div", { class: "hero-stage" });
  const caption = h("div", { class: "hero-caption" });
  const net = h("div", { class: "stage-net" });
  const gantt = h("div", { class: "stage-gantt" });
  stage.append(caption, net, gantt);

  root.replaceChildren(
    h("section", { class: "hero" },
      h("div", {},
        h("h1", {}, "Watch an agent schedule a job shop."),
        h("p", { class: "lede" }, "Drop a JSSP instance, solve it with a trained PPO agent or a dispatching rule, " +
          "and replay every decision as tokens moving through the colored timed Petri net."),
        h("div", { style: { display: "flex", gap: "10px", marginTop: "26px", flexWrap: "wrap" } },
          h("a", { class: "btn primary big", href: "#/solve" }, "Solve an instance"),
          h("a", { class: "btn big", href: "#/train" }, "Train an agent"))),
      stage),
    envSection(),
    h("section", { class: "doors" },
      h("a", { class: "door solve", href: "#/solve" },
        h("h2", {}, "I have an agent"),
        h("p", {}, "Use a stock agent, one you trained here, or upload your own MaskablePPO .zip. Compare it with dispatching rules on any instance."),
        doorIcon("solve")),
      h("a", { class: "door", href: "#/train" },
        h("h2", {}, "I want to train one"),
        h("p", {}, "Pick instances of one size, set the reward and the training budget, and follow the learning curve live. The agent is saved to your library."),
        doorIcon("train"))),
    h("div", { class: "home-foot" },
      h("span", {}, h("b", {}, state.instances.filter((i) => i.source === "benchmark").length), " benchmark instances"),
      h("span", {}, h("b", {}, learned.length), " trained agents"),
      h("span", {}, h("b", {}, state.agents.length - learned.length), " dispatching rules")));

  let player = null, chart = null, timer = null, makeChart = null;
  stage.append(h("div", { class: "hero-theme" }, themeSwitch()));
  const stopTheme = followSimTheme(stage, () => {        // the compact Gantt is rebuilt in the new colors
    if (!player || !makeChart) return;
    chart.destroy();
    chart = makeChart();
    chart.setClock(player.clock);
  });
  try {
    const run = await api("/api/demo");
    caption.replaceChildren(
      h("span", {}, `${run.instance.name} · ${run.agent.name}`),
      h("span", { class: "clock" }, "t = 0"));
    const clockEl = caption.lastChild;
    makeChart = () => new Gantt(gantt, { schedule: run.schedule, nJobs: run.instance.n_jobs, nMachines: run.instance.n_machines,
      makespan: run.makespan, dark: simThemeName() === "dark", compact: true });
    chart = makeChart();
    player = new PetriPlayer(net, run, {
      compact: true,
      onClock: (t) => { chart.setClock(t); clockEl.textContent = `t = ${Math.floor(t)}`; },
      onState: (st) => {
        if (!st.playing && st.k >= st.n && player) timer = setTimeout(() => player?.play(), 2500);
      },
    });
    player.setSpeed(matchMedia("(prefers-reduced-motion: reduce)").matches ? 64 : 4);
    player.toStart();
    player.play();
  } catch (e) {
    caption.textContent = "Demo replay unavailable: " + e.message;
  }
  return () => { clearTimeout(timer); stopTheme(); player?.destroy(); player = null; chart?.destroy(); };
}

// The environment decides what one agent action is; Train and Solve follow this choice.
function envSection() {
  const box = h("div", { class: "env-cards", role: "radiogroup", "aria-label": "Environment" });
  const render = () => box.replaceChildren(...state.envs.map((e) => {
    const on = e.name === state.env;
    return h("button", { type: "button", class: `env-card${on ? " on" : ""}`, role: "radio", "aria-checked": on,
      onclick: () => { setEnv(e.name); render(); } },
      h("span", { class: "env-top" }, h("h3", {}, e.title), on ? h("span", { class: "chip dark" }, "Selected") : h("span", { class: "chip" }, "Choose")),
      h("p", {}, e.description),
      envFlow(e.name));
  }));
  render();
  return h("section", { class: "env-section" },
    h("div", { class: "env-head" }, h("h2", {}, "Environment"),
      h("p", {}, "What one decision of the agent is. Training and solving use the environment chosen here.")),
    box);
}

// a small picture of one agent step in the env
function envFlow(name) {
  const tok = (txt, cls = "") => h("span", { class: `flow-tok ${cls}` }, txt);
  const arrow = () => h("span", { class: "flow-arrow", "aria-hidden": "true" });
  if (name === "hyper") {
    return h("div", { class: "flow" }, tok("state"), arrow(), tok("agent", "agent"), arrow(), tok("MTWR", "rule"), arrow(),
      h("span", { class: "flow-group" }, tok("J3", "job"), tok("J1", "job"), tok("J5", "job"), h("small", {}, "k decisions")));
  }
  return h("div", { class: "flow" }, tok("state"), arrow(), tok("agent", "agent"), arrow(), tok("J3", "job"), h("small", {}, "or wait"));
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
