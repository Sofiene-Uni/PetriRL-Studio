// Run view: KPIs, interactive Gantt, Petri net replay with transport and decision inspector.
import { Gantt } from "../components/gantt.js";
import { PetriPlayer, SPEEDS } from "../components/petri-player.js";
import { PolicyView, confidenceStrip } from "../components/policy-view.js";
import { seg } from "../components/segmented.js";
import { api } from "../core/api.js";
import { jobColor } from "../core/colors.js";
import { download, h, icons } from "../core/dom.js";
import { REF_NAME, REF_SHORT } from "../core/reference.js";
import { followSimTheme, themeSwitch } from "../core/sim-theme.js";
import { toast } from "../core/ui.js";

export async function runView(root, rid) {
  const run = await api(`/api/runs/${rid}`);
  const { instance: inst, agent } = run;
  const nOps = inst.n_ops;
  const nWaits = run.decisions.filter((d) => d.wait).length;
  const ref = run.reference || { value: run.lb, kind: "lower bound" };
  const fileBase = `plan_${inst.name}_${agent.name}`.replace(/[^\w.-]+/g, "_");

  // ---------------------------------------------------------------- header + KPIs
  const head = h("div", { class: "run-head" },
    h("div", {},
      h("h1", {}, `${inst.name} solved by ${agent.name}`),
      h("div", { class: "sub" },
        h("span", { class: "size" }, `${inst.n_jobs}×${inst.n_machines}`),
        h("span", { class: "chip" }, agent.kind === "rule" ? "Dispatching rule" : "PPO agent"),
        run.status === "done" ? h("span", { class: "chip green" }, "All operations scheduled")
          : h("span", { class: "chip red" }, "Episode truncated before the end"),
        agent.kind !== "rule" ? h("span", { class: "chip" }, run.deterministic ? "Greedy actions" : "Sampled actions") : null,
        run.env ? h("span", { class: "chip blue" }, `Env: ${run.env.title}${run.env.commitment_length ? `, k = ${run.env.commitment_length}` : ""}`) : null,
        run.standby && run.standby !== "off" ? h("span", { class: "chip amber" }, `Wait action ${run.standby === "gt" ? "when useful" : "always"}, used ${nWaits} times`) : null)),
    h("div", { class: "toolbar" },
      h("a", { class: "btn", href: `/api/runs/${rid}/plan.csv`, html: `${icons.download} Plan CSV` }),
      h("button", { class: "btn", html: `${icons.download} Gantt PNG`, onclick: async () => download(`${fileBase}.png`, await gantt.toPNG()) }),
      h("button", { class: "btn", html: `${icons.download} SVG`, onclick: () => download(`${fileBase}.svg`, gantt.toSVGString(), "image/svg+xml") }),
      h("a", { class: "btn dark", href: "#/solve" }, "Solve another")));

  const kpis = h("div", { class: "kpis" },
    kpi("Makespan", run.makespan, "", true),
    kpi(REF_NAME[ref.kind], ref.value, "", false, ref.kind === "lower bound" ? "computed from the instance" : ref.source),
    kpi(`Gap to ${ref.kind}`, run.gap.toFixed(1), "%"),
    kpi("Agent decisions", run.n_decisions),
    kpi("Solve time", run.runtime_ms < 1000 ? Math.round(run.runtime_ms) : (run.runtime_ms / 1000).toFixed(2), run.runtime_ms < 1000 ? " ms" : " s"));

  // ---------------------------------------------------------------- Gantt panel
  const ganttBox = h("div", { class: "gantt-wrap" });
  const legend = h("div", { class: "gantt-legend" });
  const modeSeg = seg([["machine", "Machines"], ["job", "Jobs"]], "machine", (m) => gantt.setMode(m));
  const critBtn = h("button", { class: "btn small", onclick: () => { const on = gantt.toggleCritical(); critBtn.classList.toggle("dark", on); } }, "Critical path");
  const ganttPanel = h("section", { class: "panel gantt-panel" },
    h("div", { class: "panel-head" },
      h("div", {}, h("h2", {}, "Plan"), h("p", {}, "Click a bar to follow its job, click the timeline to move the replay there. Ctrl + scroll zooms, drag pans.")),
      h("div", { class: "toolbar" }, modeSeg, critBtn,
        h("button", { class: "btn small", onclick: () => gantt.zoom(0.7), "aria-label": "Zoom in" }, "+"),
        h("button", { class: "btn small", onclick: () => gantt.zoom(1 / 0.7), "aria-label": "Zoom out" }, "−"),
        h("button", { class: "btn small ghost", onclick: () => gantt.resetZoom() }, "Fit"))),
    ganttBox, legend);

  // ---------------------------------------------------------------- player
  const stage = h("div", { class: "net-stage" });
  const zoomBtns = h("div", { class: "net-zoom" },
    h("button", { onclick: () => player.zoom(1 / 1.25), "aria-label": "Zoom in net" }, "+"),
    h("button", { onclick: () => player.zoom(1.25), "aria-label": "Zoom out net" }, "−"),
    h("button", { onclick: () => player.fit(), "aria-label": "Fit net", style: { fontSize: "11px", width: "38px" } }, "Fit"));
  const clockEl = h("div", { class: "clock" });
  const relEl = h("b"), doneEl = h("b"), evEl = h("b");
  const decisionBox = h("div", { class: "decision" });
  const logBox = h("div", { class: "dlog" });
  const inspector = h("aside", { class: "inspector" },
    h("div", { class: "clock-box" }, h("span", {}, "Time"), clockEl,
      h("div", { class: "clock-stats" }, h("span", {}, "released ", relEl), h("span", {}, "finished ", doneEl), h("span", {}, "firings ", evEl))),
    decisionBox, logBox);

  const playBtn = h("button", { class: "tbtn play", "aria-label": "Play", html: icons.play });
  const scrub = h("div", { class: "scrub", role: "slider", tabindex: 0, "aria-label": "Replay position", "aria-valuemin": 0, "aria-valuemax": run.makespan },
    h("div", { class: "track" }), h("div", { class: "fill" }), h("div", { class: "knob" }));
  const speedSel = h("select", { "aria-label": "Speed" }, SPEEDS.map((v) => h("option", { value: v }, `${v}×`)));
  const transport = h("div", { class: "transport" },
    h("div", { class: "keys" },
      h("button", { class: "tbtn", "aria-label": "Go to start", html: icons.start, onclick: () => player.toStart() }),
      h("button", { class: "tbtn", "aria-label": "Step back", html: icons.back, onclick: () => player.stepWave(-1) }),
      playBtn,
      h("button", { class: "tbtn", "aria-label": "Step forward", html: icons.fwd, onclick: () => player.stepWave(1) }),
      h("button", { class: "tbtn", "aria-label": "Go to end", html: icons.end, onclick: () => player.toEnd() })),
    scrub,
    h("label", { class: "speed" }, "Speed", speedSel));

  const playerEl = h("section", { class: "player" },
    h("div", { class: "player-top" },
      h("div", {}, h("h2", {}, "Petri net replay"),
        h("p", {}, "Every transition firing of the episode, in order. Before each decision, the blue transitions are the jobs the agent could release.")),
      h("div", { class: "player-tools" }, themeSwitch(), zoomBtns)),
    h("div", { class: "player-body" }, stage, inspector),
    h("div", { class: "net-legend" },
      legendItem('<circle cx="7" cy="7" r="4.5" fill="#2F5BEA"/>', "operation token, colored by job"),
      legendItem('<circle cx="7" cy="7" r="5.5" fill="none" stroke="#6B7480" stroke-dasharray="2 2"/><circle cx="7" cy="7" r="2.5" fill="#C9D0DA"/>', "free flag (job or machine)"),
      legendItem('<rect x="1" y="4" width="12" height="6" rx="1.5" fill="#2F5BEA"/>', "agent action, enabled"),
      legendItem('<rect x="1" y="4" width="12" height="6" rx="1.5" fill="none" stroke="#5A636F" stroke-dasharray="3 2"/><path d="M4.5 4.5l5 5M9.5 4.5l-5 5" stroke="#D2453B" stroke-width="1.4"/>', "agent action, masked"),
      legendItem('<rect x="1" y="4" width="12" height="6" rx="1.5" fill="#6B7480"/>', "automatic"),
      legendItem('<rect x="1" y="4" width="12" height="6" rx="1.5" fill="#C9D0DA"/>', "timed (finish)"),
      legendItem('<rect x="1" y="4" width="12" height="6" rx="1.5" fill="#F2A93B"/>', "firing"),
      h("span", {}, "Space plays or pauses, arrow keys step, Ctrl + scroll zooms")),
    transport);

  root.replaceChildren(head, kpis, ganttPanel, playerEl);

  // ---------------------------------------------------------------- components
  const gantt = new Gantt(ganttBox, {
    schedule: run.schedule, nJobs: inst.n_jobs, nMachines: inst.n_machines, makespan: run.makespan, reference: { value: ref.value, label: `${REF_SHORT[ref.kind]} ${ref.value}` },
    onSeek: (t) => player.seekTime(t),
  });
  const renderLegend = (focus) => legend.replaceChildren(...Array.from({ length: inst.n_jobs }, (_, i) => i + 1).map((j) =>
    h("button", { class: `jobkey${focus === j ? " on" : ""}`, onclick: () => gantt.setFocus(j) }, h("i", { style: { background: jobColor(j) } }), `J${j}`)));
  gantt.onFocus = renderLegend;
  renderLegend(null);

  // decision log
  // a release decision: its first firing moves the released token; a wait: the clock runs to the next firing
  const opOf = (d) => { const ev = run.events[d.e]; return ev && !d.wait ? run.tokens[ev[3]] : null; };
  const waitUntil = (d) => run.events[d.e]?.[0] ?? run.makespan;
  // actions of the agent: jobs (and wait) in the dispatching env, heuristics in the hyper-heuristic env
  const macros = run.macros || [];
  const hyper = macros.length > 0;
  const keys = run.action_keys || Array.from({ length: inst.n_jobs }, (_, i) => String(i + 1));
  const labelOf = (k) => (/^\d+$/.test(k) ? `J${k}` : k === "wait" ? "Wait" : k);
  const colorOf = (k) => (/^\d+$/.test(k) ? jobColor(+k) : k === "wait" ? "#C9D0DA" : HEURISTIC_COLORS[keys.indexOf(k) % HEURISTIC_COLORS.length]);
  const policyInput = (d) => (d.macro != null
    ? { probs: macros[d.macro].probs, chosen: macros[d.macro].heuristic, keys, enabled: macros[d.macro].enabled, labelOf, colorOf }
    : { probs: d.probs, chosen: d.wait ? "wait" : String(d.job), keys, labelOf, colorOf,
        enabled: [...d.enabled.map(String), ...(d.wait_enabled ? ["wait"] : [])] });

  const logButtons = run.decisions.map((d) => {
    const tok = opOf(d);
    return h("button", { onclick: () => player.seekEvent(d.e, d.clock), title: "Jump to just before this decision" },
      h("span", { class: "t" }, `t ${d.clock}`), h("i", { style: { background: d.wait ? "transparent" : jobColor(d.job), border: d.wait ? "1.5px solid var(--sim-muted)" : null } }),
      h("span", {}, d.wait ? `wait until t ${waitUntil(d)}` : `J${d.job} op ${tok?.[2] ?? "?"} to M${tok?.[1] ?? "?"}`,
        d.macro != null ? h("em", { class: `htag${d.step === 0 ? " first" : ""}` }, macros[d.macro].heuristic) : null));
  });
  const policyBox = h("div");
  const policy = new PolicyView(policyBox, { hidden: agent.net_arch, nObs: agent.obs_dim });
  const withProbs = run.decisions.map((d) => (d.macro != null ? { ...d, probs: macros[d.macro].probs } : d));
  const hasProbs = withProbs.some((d) => d.probs);
  const strip = hasProbs ? confidenceStrip(withProbs, (i) => player.seekEvent(run.decisions[i].e, run.decisions[i].clock)) : null;
  logBox.append(...[
    strip ? h("div", { class: "strip-box" }, h("h3", {}, "Confidence over the episode"), strip.el) : null,
    h("h3", {}, `${run.decisions.length} decisions${nWaits ? `, ${nWaits} waits` : ""}`), ...logButtons].filter(Boolean));

  let lastDi = null;
  const showDecision = (di, d) => {
    if (di === lastDi) return;
    if (lastDi != null && logButtons[lastDi]) logButtons[lastDi].classList.remove("now");
    lastDi = di;
    if (di < 0 || !d) {
      decisionBox.replaceChildren(h("h3", {}, "Decision"), h("p", { style: { color: "var(--sim-muted)", fontSize: "13px" } }, "No decision taken yet. Press play or step forward."));
      return;
    }
    const btn = logButtons[di];
    btn.classList.add("now");
    if (player?.playing) logBox.scrollTop = btn.offsetTop - logBox.clientHeight / 2;
    const tok = opOf(d);
    strip?.draw(di);
    decisionBox.replaceChildren(...[
      h("h3", {}, `Decision ${di + 1} of ${run.decisions.length} at t ${d.clock}`),
      h("div", { class: "chosen" }, h("i", { style: { width: "11px", height: "11px", borderRadius: "50%", display: "inline-block",
        background: d.wait ? "transparent" : jobColor(d.job), border: d.wait ? "1.5px solid var(--sim-muted)" : null } }),
        d.wait ? `Waited until t ${waitUntil(d)}, when the next operation finished` :
          `Released J${d.job}, operation ${tok?.[2]} to M${tok?.[1]} (${tok?.[3]} time units)`),
      d.macro != null ? h("p", { class: "macro-line" }, "by heuristic ", h("b", {}, macros[d.macro].heuristic),
        `, decision ${d.step + 1} of ${run.env?.commitment_length ?? "k"} of agent action ${d.macro + 1}/${macros.length}`) : null,
      policyBox].filter(Boolean));
    const input = policyInput(d);
    const animate = (!player?.playing || player.speed <= 8) && (d.macro == null || d.step === 0 || !player?.playing);
    if (input.probs) policy.show(input, { animate });
    else policy.showRule(agent.name, input, { animate });
  };

  let player = null;
  const placeRoles = new Map(run.net.nodes.map((n) => [n.id, n.role]));
  const counts = () => {
    if (!player) return;
    let waiting = 0, done = 0;
    for (const [p, toks] of player.marking) {
      const r = placeRoles.get(p);
      if (r === "job") waiting += toks.length;
      else if (r === "delivery") done += toks.length;
    }
    relEl.textContent = `${nOps - waiting}/${nOps}`;
    doneEl.textContent = `${done}/${nOps}`;
  };

  const knob = scrub.querySelector(".knob"), fill = scrub.querySelector(".fill");
  const onClock = (t) => {
    const atEnd = player && player.k >= run.events.length && t >= run.makespan;
    gantt.setClock(atEnd ? null : t);
    clockEl.innerHTML = `${Math.floor(t)}<small> / ${run.makespan}</small>`;
    const f = `${(100 * t) / run.makespan}%`;
    knob.style.left = f;
    fill.style.width = f;
    scrub.setAttribute("aria-valuenow", Math.floor(t));
  };
  player = new PetriPlayer(stage, run, {
    onClock,
    onDecision: showDecision,
    onState: (st) => {
      playBtn.innerHTML = st.playing ? icons.pause : icons.play;
      playBtn.setAttribute("aria-label", st.playing ? "Pause" : "Play");
      evEl.textContent = `${st.k}/${st.n}`;
      counts();
    },
  });
  player.emit();
  speedSel.value = String(player.autoSpeed());
  speedSel.addEventListener("change", () => player.setSpeed(+speedSel.value));
  playBtn.addEventListener("click", () => player.toggle());

  // scrubber
  const seekFromEvent = (e) => {
    const r = scrub.getBoundingClientRect();
    player.seekTime(Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)) * run.makespan);
  };
  let scrubbing = false;
  scrub.addEventListener("pointerdown", (e) => { scrubbing = true; scrub.setPointerCapture(e.pointerId); seekFromEvent(e); });
  scrub.addEventListener("pointermove", (e) => scrubbing && seekFromEvent(e));
  scrub.addEventListener("pointerup", () => { scrubbing = false; });
  scrub.addEventListener("keydown", (e) => {
    if (e.key === "ArrowRight") { e.preventDefault(); player.stepWave(1); }
    if (e.key === "ArrowLeft") { e.preventDefault(); player.stepWave(-1); }
  });

  const onKey = (e) => {
    if (e.target.closest("input, select, textarea, .scrub")) return;
    if (e.code === "Space") { e.preventDefault(); player.toggle(); }
    else if (e.key === "ArrowRight") { e.preventDefault(); player.stepWave(1); }
    else if (e.key === "ArrowLeft") { e.preventDefault(); player.stepWave(-1); }
  };
  addEventListener("keydown", onKey);
  if (run.status !== "done") toast("This episode was truncated: the agent kept choosing actions that did not progress.", "error");

  const stopTheme = followSimTheme(playerEl);
  return () => { removeEventListener("keydown", onKey); stopTheme(); player.destroy(); gantt.destroy(); policy.destroy(); strip?.destroy(); };
}

const HEURISTIC_COLORS = ["#E09A2C", "#13A4B4", "#945ECF", "#19A979", "#ED4A7B", "#3D7FB8", "#C9A227",
  "#D44D3A", "#2E9E8F", "#B05FA2", "#6F8B2B", "#5A6ACF", "#A2563A", "#2B8CBE"];

function kpi(label, value, unit = "", lead = false, note = null) {
  return h("div", { class: `kpi${lead ? " lead" : ""}` }, h("span", {}, label), h("strong", {}, value, unit ? h("small", {}, unit) : null),
    note ? h("em", {}, note) : null);
}


function legendItem(svgInner, text) {
  return h("span", { html: `<svg viewBox="0 0 14 14" width="14" height="14">${svgInner}</svg>` }, text);
}

