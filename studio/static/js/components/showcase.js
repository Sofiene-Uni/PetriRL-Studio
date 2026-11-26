// Home showcase: a recorded episode (static JSON, no server work) replayed live on the Petri net and the Gantt chart,
// with the agent's decision, policy network and confidence beside it. Loops until destroyed.
import { jobColor } from "../core/colors.js";
import { h } from "../core/dom.js";
import { followSimTheme } from "../core/sim-theme.js";
import { Gantt } from "./gantt.js";
import { PetriPlayer } from "./petri-player.js";
import { PolicyView, confidenceStrip } from "./policy-view.js";
import { t } from "../core/i18n.js";

const SPEED = 4;          // simulation time units per second
const PAUSE_MS = 2500;    // hold the final plan before looping

export function showcase(run) {
  const clockEl = h("span", { class: "clock" }, "t = 0");
  const net = h("div", { class: "stage-net" });
  const gbox = h("div", { class: "stage-gantt" });
  const decisionBox = h("div", { class: "decision" });
  const stripBox = h("div", { class: "show-strip" });
  const logBox = h("div", { class: "dlog" });
  const el = h("div", { class: "showcase" },
    h("div", { class: "hero-stage" },
      h("div", { class: "hero-caption" }, h("span", {}, `${run.instance.name} · ${run.agent.name}`), clockEl),
      net, gbox),
    h("aside", { class: "inspector" }, decisionBox, stripBox, logBox));

  const opOf = (d) => (d.wait ? null : run.tokens[run.events[d.e]?.[3]]);
  const waitUntil = (d) => run.events[d.e]?.[0] ?? run.makespan;
  const dot = (d) => (d.wait ? { border: "1.5px solid var(--sim-muted)" } : { background: jobColor(d.job) });
  const nWaits = run.decisions.filter((d) => d.wait).length;

  const policyBox = h("div");
  const policy = new PolicyView(policyBox, { hidden: run.agent.net_arch, nObs: run.agent.obs_dim });
  const strip = confidenceStrip(run.decisions, () => {});
  stripBox.append(h("h3", {}, t("Confidence over the episode")), strip.el);
  const rows = run.decisions.map((d) => {
    const tok = opOf(d);
    return h("button", { type: "button", tabindex: -1 }, h("span", { class: "t" }, `t ${d.clock}`), h("i", { style: dot(d) }),
      h("span", {}, d.wait ? t("wait until t {t}", { t: waitUntil(d) }) : t("J{job} op {op} to M{m}", { job: d.job, op: tok[2], m: tok[1] })));
  });
  logBox.append(h("h3", {}, (nWaits ? t("{n} decisions, {w} waits", { n: run.decisions.length, w: nWaits }) : t("{n} decisions", { n: run.decisions.length }))), ...rows);

  const spec = {
    keys: run.action_keys,
    labelOf: (k) => (k === "wait" ? t("Wait") : `J${k}`),
    colorOf: (k) => (k === "wait" ? "#C9D0DA" : jobColor(+k)),
  };
  let shown = null;
  const show = (di, d) => {
    if (di === shown) return;
    rows[shown]?.classList.remove("now");
    shown = di;
    if (!d) {
      decisionBox.replaceChildren(h("h3", {}, t("Decision")), h("p", { class: "muted" }, t("Waiting for the first decision.")));
      return;
    }
    rows[di].classList.add("now");
    logBox.scrollTop = rows[di].offsetTop - logBox.clientHeight / 2;
    strip.draw(di);
    const tok = opOf(d);
    decisionBox.replaceChildren(h("h3", {}, t("Decision {n} of {total} at t {t}", { n: di + 1, total: run.decisions.length, t: d.clock })),
      h("div", { class: "chosen" }, h("i", { class: "chosen-dot", style: dot(d) }),
        d.wait ? t("Waited until t {t}, when the next operation finished", { t: waitUntil(d) })
          : t("Released J{job}, operation {op} to M{m} ({p} time units)", { job: d.job, op: tok[2], m: tok[1], p: tok[3] })),
      policyBox);
    policy.show({ ...spec, probs: d.probs, chosen: d.wait ? "wait" : String(d.job),
      enabled: [...d.enabled.map(String), ...(d.wait_enabled ? ["wait"] : [])] }, { animate: true });
  };

  const stopTheme = followSimTheme(el);
  const chart = new Gantt(gbox, { schedule: run.schedule, nJobs: run.instance.n_jobs, nMachines: run.instance.n_machines,
    makespan: run.makespan, compact: true });
  let timer = null, live = false;       // live: ignore the end state the player reports while it is built
  const player = new PetriPlayer(net, run, {
    compact: true,
    onClock: (t) => { chart.setClock(t); clockEl.textContent = `t = ${Math.floor(t)}`; },
    onDecision: show,
    onState: (st) => {
      if (!live || st.playing || st.k < st.n) return;
      clearTimeout(timer);
      timer = setTimeout(() => { player.toStart(); player.play(); }, PAUSE_MS);
    },
  });
  player.setSpeed(SPEED);
  player.toStart();
  show(-1, null);
  live = true;
  player.play();

  const destroy = () => { clearTimeout(timer); stopTheme(); player.destroy(); chart.destroy(); policy.destroy(); strip.destroy?.(); };
  return { el, destroy };
}
