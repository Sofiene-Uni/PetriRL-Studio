// Solve view: choose instances and agents in dropdowns (or drop files), solve every pair, compare.
import { dropZone } from "../components/dropzone.js";
import { randomForm, uploadInstances } from "../components/instance-actions.js";
import { agentPicker, instancePicker } from "../components/pickers.js";
import { agentSummary, resultsTable } from "../components/results-table.js";
import { api } from "../core/api.js";
import { h } from "../core/dom.js";
import { envOf, refreshLibrary, state } from "../core/state.js";
import { seg } from "../components/segmented.js";
import { toast } from "../core/ui.js";

export async function solveView(root) {
  const pickedInsts = () => state.instances.filter((i) => state.pickedInstances.has(i.id));
  const pickedAgents = () => state.agents.filter((a) => state.pickedAgents.has(a.id));
  const changed = () => { agents.render(); renderBar(); };

  const insts = instancePicker(state.pickedInstances, changed);
  let envFilter = state.env;
  const agents = agentPicker(state.pickedAgents, () => renderBar(), pickedInsts, () => envFilter);
  const envSeg = seg([["all", "All"], ...state.envs.map((e) => [e.name, e.title])], envFilter, (v) => { envFilter = v; agents.render(); });
  const uploadEnv = h("select", { class: "env-select", "aria-label": "Environment of the uploaded agent" },
    h("option", { value: "" }, "detect from the agent"), ...state.envs.map((e) => h("option", { value: e.name }, e.title)));

  const instDrop = dropZone({ slim: true, accept: ".txt,.jsp,.fjs,.dat,text/plain,*", title: "Drop instance files here",
    hint: "or click to browse", onFiles: async (files) => {
      try {
        (await uploadInstances(files)).forEach((a) => state.pickedInstances.add(a.id));
        insts.render(); changed();
      } catch (e) { toast(e.message, "error"); }
    } });

  const agentDrop = dropZone({ slim: true, accept: ".zip", multiple: false, title: "Drop an agent .zip",
    hint: "MaskablePPO saved by stable-baselines3", onFiles: async ([file]) => {
      const fd = new FormData();
      fd.append("file", file);
      if (uploadEnv.value) fd.append("env", uploadEnv.value);
      try {
        toast("Reading the agent…");
        const meta = await api("/api/agents", { method: "POST", body: fd });
        await refreshLibrary();
        state.pickedAgents.add(meta.id);
        agents.render(); renderBar();
        toast(`Added ${meta.name}: a ${envOf(meta.env).title.toLowerCase()} ${meta.n_jobs}×${meta.n_machines} agent${meta.standby !== "off" ? " with a wait action" : ""}`);
      } catch (e) { toast(e.message, "error"); }
    } });

  const setup = h("section", { class: "panel" },
    h("div", { class: "panel-head" }, h("div", {}, h("h2", {}, "Setup"), h("p", {}, "Every chosen agent runs on every chosen instance of its size"))),
    h("div", { class: "panel-body setup-grid" },
      h("div", { class: "setup-col" },
        h("span", { class: "field-label" }, "Instances"),
        insts.el,
        instDrop,
        h("details", { class: "inline-more" }, h("summary", {}, "Generate a random instance"),
          randomForm((rec) => { state.pickedInstances.add(rec.id); insts.render(); changed(); })),
        h("p", { class: "formats", html: "Reads the standard format <code>n_jobs n_machines</code> + <code>machine time</code> pairs, " +
          "Taillard's times/machines matrices, and PetriRL's <code>machine tool time</code> triples." })),
      h("div", { class: "setup-col" },
        h("div", { class: "label-row" }, h("span", { class: "field-label" }, "Agents and rules"), envSeg),
        agents.el,
        agentDrop,
        h("label", { class: "upload-env" }, "Environment of a dropped agent:", uploadEnv),
        h("p", { class: "formats" }, "A trained agent only solves instances of the size it was trained on. Rules solve any size. " +
          "No agent for your size? ", h("a", { href: "#/train" }, "Train one"), "."))));

  // run bar
  const det = h("input", { type: "checkbox", checked: true });
  const go = h("button", { class: "btn primary" }, "Solve");
  const summary = h("div", { class: "summary" });
  function renderBar() {
    const ni = state.pickedInstances.size, na = state.pickedAgents.size;
    let pairs = 0;
    for (const i of pickedInsts()) for (const a of pickedAgents())
      if (a.kind === "rule" || (a.n_jobs === i.n_jobs && a.n_machines === i.n_machines)) pairs++;
    summary.replaceChildren(!ni || !na ? "Choose at least one instance and one agent"
      : h("span", {}, h("b", {}, ni), ` instance${ni > 1 ? "s" : ""} × `, h("b", {}, na), ` agent${na > 1 ? "s" : ""}: `,
        h("b", {}, pairs), ` run${pairs === 1 ? "" : "s"}${pairs < ni * na ? " (other sizes are skipped)" : ""}`));
    go.disabled = !pairs;
    go.textContent = pairs > 1 ? `Solve ${pairs} runs` : "Solve";
  }

  const results = h("div", { class: "results" });
  const showResults = (res, scroll = true) => {
    const agentsInBatch = new Set(res.results.map((r) => r.agent.id)).size;
    results.replaceChildren(...[
      agentsInBatch > 1 ? h("section", { class: "panel", style: { marginBottom: "16px" } },
        h("div", { class: "panel-head" }, h("div", {}, h("h2", {}, "Agents compared"),
          h("p", {}, "Gap = (makespan − reference) / reference, with the optimum or best known solution as reference"))),
        agentSummary(res.results)) : null,
      h("section", { class: "panel" },
      h("div", { class: "panel-head" }, h("div", {}, h("h2", {}, "Results"), h("p", {}, "The best makespan per instance is marked. Open a run to see its plan and replay it."))),
      resultsTable(res.results),
      res.skipped.length ? h("p", { class: "panel-body muted" }, `${res.skipped.length} pair(s) skipped: agent and instance sizes differ.`) : null)]
      .filter(Boolean));
    if (scroll) results.scrollIntoView({ behavior: "smooth", block: "start" });
  };
  go.addEventListener("click", async () => {
    go.disabled = true;
    go.replaceChildren(h("span", { class: "spinner" }), "Solving");
    try {
      const res = await api("/api/solve", { json: { instance_ids: [...state.pickedInstances], agent_ids: [...state.pickedAgents], deterministic: det.checked } });
      if (res.results.length === 1 && !res.skipped.length) { location.hash = `#/run/${res.results[0].id}`; return; }
      state.lastResults = res;
      showResults(res);
    } catch (e) { toast(e.message, "error"); } finally { renderBar(); }
  });

  renderBar();
  root.replaceChildren(
    h("div", { class: "page-head" }, h("div", {}, h("h1", {}, "Solve"),
      h("p", {}, "Choose instances and agents. Each run returns a plan you can explore and an episode you can replay on the Petri net."))),
    setup,
    h("div", { class: "runbar" }, summary,
      h("div", { class: "opts" }, h("label", { class: "switch", title: "Off: the agent samples its actions" }, det, "Greedy actions"), go)),
    results);
  if (state.lastResults) showResults(state.lastResults, false);
  return () => { insts.destroy(); agents.destroy(); };
}
