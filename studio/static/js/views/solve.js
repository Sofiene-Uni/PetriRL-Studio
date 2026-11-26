// Solve view: choose instances and agents in dropdowns (or drop files), solve every pair, compare.
import { dropZone } from "../components/dropzone.js";
import { randomForm, uploadInstances } from "../components/instance-actions.js";
import { agentPicker, anySize, instancePicker } from "../components/pickers.js";
import { agentSummary, resultsTable } from "../components/results-table.js";
import { api } from "../core/api.js";
import { h } from "../core/dom.js";
import { fmt } from "../core/format.js";
import { envOf, refreshLibrary, state } from "../core/state.js";
import { toast } from "../core/ui.js";
import { t } from "../core/i18n.js";

export async function solveView(root) {
  const pickedInsts = () => state.instances.filter((i) => state.pickedInstances.has(i.id));
  const pickedAgents = () => state.agents.filter((a) => state.pickedAgents.has(a.id));
  const changed = () => { agents.render(); renderBar(); fillSolInst(); };

  const insts = instancePicker(state.pickedInstances, changed);
  const metaBox = h("div", { class: "meta-settings" });
  const agents = agentPicker(state.pickedAgents, () => { renderMeta(); renderBar(); }, pickedInsts);
  // RL agents follow the environment chosen at the top: drop the picked ones of another environment
  const keepEnv = () => {
    for (const a of pickedAgents()) if (!anySize(a) && (a.env || "basic") !== state.env) state.pickedAgents.delete(a.id);
  };
  const onEnv = () => { keepEnv(); agents.render(); renderMeta(); renderBar(); };
  keepEnv();
  document.addEventListener("envchange", onEnv);

  const instDrop = dropZone({ slim: true, accept: ".txt,.jsp,.fjs,.dat,text/plain,*", title: t("Drop instance files here"),
    hint: t("or click to browse"), onFiles: async (files) => {
      try {
        (await uploadInstances(files)).forEach((a) => state.pickedInstances.add(a.id));
        insts.render(); changed();
      } catch (e) { toast(e.message, "error"); }
    } });

  const agentDrop = dropZone({ slim: true, accept: ".zip", multiple: false, title: t("Drop an agent .zip"),
    hint: t("MaskablePPO saved by stable-baselines3"), onFiles: async ([file]) => {
      const fd = new FormData();
      fd.append("file", file);
      try {
        toast(t("Reading the agent…"));
        const meta = await api("/api/agents", { method: "POST", body: fd });
        await refreshLibrary();
        state.pickedAgents.add(meta.id);
        agents.render(); renderBar();
        toast(t("Added {name}: {env}, {size}", { name: meta.name, env: t(envOf(meta.env).title), size: `${meta.n_jobs}×${meta.n_machines}` }));
      } catch (e) { toast(e.message, "error"); }
    } });

  const setup = h("section", { class: "panel" },
    h("div", { class: "panel-head" }, h("div", {}, h("h2", {}, t("Setup")), h("p", {}, t("Every chosen agent runs on every chosen instance of its size")))),
    h("div", { class: "panel-body setup-grid" },
      h("div", { class: "setup-col" },
        h("span", { class: "field-label" }, t("Instances")),
        insts.el,
        instDrop,
        h("details", { class: "inline-more" }, h("summary", {}, t("Generate a random instance")),
          randomForm((rec) => { state.pickedInstances.add(rec.id); insts.render(); changed(); })),
        h("p", { class: "formats", html: t("Reads the standard format <code>n_jobs n_machines</code> + <code>machine time</code> pairs, Taillard's times/machines matrices, and PetriRL's <code>machine tool time</code> triples.") })),
      h("div", { class: "setup-col" },
        h("span", { class: "field-label" }, t("Agents and methods")),
        agents.el,
        agentDrop,
        metaBox,
        h("p", { class: "formats" }, t("A trained agent only solves instances of the size it was trained on. Rules and metaheuristics solve any size. No agent for your size? "), h("a", { href: "#/train" }, t("Train one")), "."))));

  // settings of the picked metaheuristics (defaults until changed)
  function renderMeta() {
    const metas = pickedAgents().filter((a) => a.kind === "meta");
    metaBox.replaceChildren(...metas.map((a) => {
      const values = (state.metaParams[a.id] ??= {});
      const fields = a.params.map((p) => p.type === "bool"
        ? h("label", { class: "switch meta-switch" }, h("input", { type: "checkbox", checked: values[p.key] ?? p.default,
          onchange: (e) => { values[p.key] = e.target.checked; } }), t(p.label))
        : h("label", { class: "meta-field" }, h("span", {}, t(p.label)),
          h("input", { type: "number", min: p.min, max: p.max, step: p.step, value: values[p.key] ?? p.default,
            oninput: (e) => { if (e.target.value !== "") values[p.key] = Number(e.target.value); } })));
      return h("details", { class: "meta-card", open: metas.length === 1 },
        h("summary", {}, t("{name} settings", { name: t(a.name) }), h("button", { type: "button", class: "btn small ghost",
          onclick: (e) => { e.preventDefault(); state.metaParams[a.id] = {}; renderMeta(); } }, t("Defaults"))),
        h("div", { class: "meta-grid" }, ...fields));
    }));
  }
  renderMeta();

  // run bar
  const det = h("input", { type: "checkbox", checked: true });
  const go = h("button", { class: "btn primary" }, t("Solve"));
  const summary = h("div", { class: "summary" });
  function renderBar() {
    const ni = state.pickedInstances.size, na = state.pickedAgents.size;
    let pairs = 0;
    for (const i of pickedInsts()) for (const a of pickedAgents())
      if (a.kind === "solution" ? i.known_solution : anySize(a) || (a.n_jobs === i.n_jobs && a.n_machines === i.n_machines)) pairs++;
    summary.replaceChildren(!ni || !na ? t("Choose at least one instance and one agent")
      : h("span", {}, t("{ni} instances × {na} agents: {pairs} runs", { ni, na, pairs }),
        pairs < ni * na ? ` ${t("(other sizes are skipped)")}` : ""));
    go.disabled = !pairs;
    go.textContent = pairs > 1 ? t("Solve {n} runs", { n: pairs }) : t("Solve");
  }

  const results = h("div", { class: "results" });
  const showResults = (res, scroll = true) => {
    const agentsInBatch = new Set(res.results.map((r) => r.agent.id)).size;
    results.replaceChildren(...[
      agentsInBatch > 1 ? h("section", { class: "panel", style: { marginBottom: "16px" } },
        h("div", { class: "panel-head" }, h("div", {}, h("h2", {}, t("Agents compared")),
          h("p", {}, t("Gap = (makespan − reference) / reference, with the optimum or best known solution as reference")))),
        agentSummary(res.results)) : null,
      h("section", { class: "panel" },
      h("div", { class: "panel-head" }, h("div", {}, h("h2", {}, t("Results")), h("p", {}, t("The best makespan per instance is marked. Open a run to see its plan and replay it.")))),
      resultsTable(res.results),
      res.skipped.length ? h("p", { class: "panel-body muted" }, t("{n} pair(s) skipped: agent and instance sizes differ.", { n: res.skipped.length })) : null)]
      .filter(Boolean));
    if (scroll) results.scrollIntoView({ behavior: "smooth", block: "start" });
  };
  // progress of a running solve job: overall bar + what the current pair is doing
  function progressView(st) {
    const c = st.current;
    const f = c && c.total ? c.done / c.total : 0;      // a metaheuristic: search = 90 %, its episode = the last 10 %
    const part = !c ? 0 : c.phase === "search" ? 0.9 * f : c.searched ? 0.9 + 0.1 * f : f;
    const frac = Math.min(1, (st.done + part) / Math.max(1, st.total));
    const what = !c ? "" : c.phase === "search"
      ? t("{instance} with {agent}: {done} of {total} schedules searched", { instance: c.instance, agent: t(c.agent), done: fmt.int(c.done), total: fmt.int(c.total) })
      : t("{instance} with {agent}: {done} of {total} operations scheduled", { instance: c.instance, agent: t(c.agent), done: fmt.int(c.done), total: fmt.int(c.total) });
    return h("div", { class: "solve-progress" },
      h("div", { class: "sp-text" }, h("span", {}, what),
        h("b", {}, `${Math.round(100 * frac)}%`, st.total > 1 ? h("small", {}, ` ${t("run {n} of {total}", { n: Math.min(st.done + 1, st.total), total: st.total })}`) : null)),
      h("div", { class: "sp-track" }, h("i", { style: { width: `${(100 * frac).toFixed(1)}%` } })));
  }

  // the server answers at once with a job; poll it: place in line, then progress, then results
  let alive = true;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  go.addEventListener("click", async () => {
    go.disabled = true;
    go.replaceChildren(h("span", { class: "spinner" }), t("Solving"));
    try {
      let st = await api("/api/solve", { json: { instance_ids: [...state.pickedInstances], agent_ids: [...state.pickedAgents], deterministic: det.checked,
        params: state.metaParams } });
      let told = false;
      while (alive && (st.status === "queued" || st.status === "running")) {
        if (st.status === "queued" && st.position) {
          if (!told) { toast(fmt.inLine(st.position)); told = true; }
          summary.replaceChildren(h("span", { class: "queue-note" }, fmt.inLine(st.position)));
          go.replaceChildren(h("span", { class: "spinner" }), t("Waiting"));
        } else if (st.status === "running") {
          summary.replaceChildren(progressView(st));
          go.replaceChildren(h("span", { class: "spinner" }), t("Solving"));
        }
        await sleep(st.status === "queued" ? 2000 : 500);
        st = await api(`/api/solve/${st.id}`);
      }
      if (!alive) return;
      if (st.status === "failed") throw new Error(st.error);
      if (st.results.length === 1 && !st.skipped.length) { location.hash = `#/run/${st.results[0].id}`; return; }
      state.lastResults = st;
      showResults(st);
    } catch (e) { toast(e.message, "error"); } finally { if (alive) renderBar(); }
  });

  renderBar();
  // replay a solution given as machine orders or as a firing sequence
  const solInst = h("select", { class: "input", "aria-label": t("Instance of the solution") });
  const fillSolInst = () => {
    const list = pickedInsts().length ? pickedInsts() : state.instances;
    const keep = solInst.value;
    solInst.replaceChildren(...list.map((i) => h("option", { value: i.id }, `${i.name}  ${i.n_jobs}×${i.n_machines}`)));
    if (list.some((i) => i.id === keep)) solInst.value = keep;
  };
  fillSolInst();
  const solText = h("textarea", { class: "input sol-text", rows: 6, spellcheck: false,
    placeholder: "Machine orders, one row per machine:\n7 11 9 10 8 3 12 2 14 5 1 6 4 0 13\n2 8 7 14 6 13 9 11 4 5 12 3 10 1 0\n...\n\nor a firing sequence: 3 0 4 w 1 ... (w = wait)" });
  const solName = h("input", { class: "input", placeholder: t("Name, e.g. CP-SAT or my schedule") });
  const solFile = h("input", { type: "file", accept: ".txt,.sol,.csv", class: "hidden",
    onchange: async () => { if (solFile.files[0]) solText.value = await solFile.files[0].text(); } });
  const solGo = h("button", { class: "btn dark", onclick: async () => {
    if (!solText.value.trim()) { toast(t("Paste or load a solution first"), "error"); return; }
    solGo.disabled = true;
    try {
      const run = await api("/api/solutions/replay", { json: { instance_id: solInst.value, text: solText.value, name: solName.value } });
      location.hash = `#/run/${run.id}`;
    } catch (e) { toast(e.message, "error"); } finally { solGo.disabled = false; }
  } }, t("Replay on the Petri net"));
  const solBox = h("details", { class: "panel sol-panel" },
    h("summary", {}, h("b", {}, t("Replay a solution")), h("span", { class: "muted" }, ` ${t("from a solver, a paper or another run")}`)),
    h("div", { class: "sol-grid" },
      h("label", { class: "field" }, h("span", {}, t("Instance")), solInst),
      h("label", { class: "field" }, h("span", {}, t("Name (optional)")), solName),
      h("label", { class: "field wide" }, h("span", {}, t("Solution")), solText,
        h("small", {}, t("Machine orders (one row per machine, as on optimizizer.com) are replayed with the wait action and give their semi-active schedule. A firing sequence is the release order of the jobs; w marks a wait. Jobs numbered from 0 or from 1. Every run can be exported in both formats."))),
      h("div", { class: "sol-actions" }, h("button", { class: "btn", onclick: () => solFile.click() }, t("Load a file")), solFile, solGo)));

  root.replaceChildren(
    h("div", { class: "page-head" }, h("div", {}, h("h1", {}, t("Solve")),
      h("p", {}, t("Choose instances and agents. Each run returns a plan you can explore and an episode you can replay on the Petri net.")))),
    setup,
    h("div", { class: "runbar" }, summary,
      h("div", { class: "opts" }, h("label", { class: "switch", title: t("Off: the agent samples its actions") }, det, t("Greedy actions")), go)),
    solBox,
    results);
  if (state.lastResults) showResults(state.lastResults, false);
  return () => { alive = false; document.removeEventListener("envchange", onEnv); insts.destroy(); agents.destroy(); };
}
