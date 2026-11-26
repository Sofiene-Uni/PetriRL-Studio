// Solved runs: the results table (Solve, History) and a per-agent summary for benchmark comparisons.
import { h } from "../core/dom.js";
import { fmt } from "../core/format.js";
import { refCell } from "../core/reference.js";
import { t } from "../core/i18n.js";

const KIND_NOTE = { rule: " (rule)", meta: " (metaheuristic)", solution: " (replay)" };
const refOf = (r) => r.reference || { value: r.lb, kind: "lower bound" };      // runs saved before references existed
const time = (ms) => (ms < 1000 ? `${Math.round(ms)} ms` : `${(ms / 1000).toFixed(1)} s`);

export function resultsTable(runs, { showDate = false } = {}) {
  const best = {};
  for (const r of runs) best[r.instance.id] = Math.min(best[r.instance.id] ?? Infinity, r.makespan);
  const maxGap = Math.max(10, ...runs.map((r) => r.gap));
  return h("table", { class: "grid" },
    h("thead", {}, h("tr", {}, [t("Instance"), t("Agent"), t("Makespan"), t("Reference"), t("Gap"), t("Decisions"), t("Time"), showDate ? "When" : null]
      .filter(Boolean).map((t) => h("th", {}, t)))),
    h("tbody", {}, runs.map((r) => h("tr", { class: `click${runs.length > 1 && r.makespan === best[r.instance.id] ? " best" : ""}`,
      onclick: () => { location.hash = `#/run/${r.id}`; } },
      h("td", {}, h("b", {}, r.instance.name), " ", h("span", { class: "size" }, `${r.instance.n_jobs}×${r.instance.n_machines}`)),
      h("td", {}, r.agent.name, KIND_NOTE[r.agent.kind] ? h("span", { class: "muted" }, KIND_NOTE[r.agent.kind]) : null),
      h("td", { class: "num" }, h("b", {}, r.makespan), r.status !== "done" ? h("span", { class: "chip red" }, "truncated") : null),
      h("td", {}, refCell(refOf(r))),
      h("td", {}, h("span", { class: "gapbar" }, h("i", { style: { width: `${(100 * Math.max(0, r.gap)) / maxGap}%` } })),
        h("span", { class: "mono" }, fmt.pct(r.gap))),
      h("td", { class: "num" }, r.n_decisions),
      h("td", { class: "num" }, time(r.runtime_ms)),
      showDate ? h("td", { class: "muted" }, fmt.ago(r.created)) : null))));
}

// Mean gap per agent over the instances it solved, and how often it found the best makespan of the batch.
export function agentSummary(runs) {
  const best = {};
  for (const r of runs) best[r.instance.id] = Math.min(best[r.instance.id] ?? Infinity, r.makespan);
  const by = new Map();
  for (const r of runs.filter((x) => x.status === "done")) {
    const a = by.get(r.agent.id) || { name: r.agent.name, kind: r.agent.kind, gaps: [], wins: 0, optimal: 0 };
    a.gaps.push(r.gap);
    a.wins += r.makespan === best[r.instance.id];
    a.optimal += refOf(r).kind === "optimum" && r.makespan === refOf(r).value;
    by.set(r.agent.id, a);
  }
  const rows = [...by.values()].map((a) => ({ ...a, mean: a.gaps.reduce((x, y) => x + y, 0) / a.gaps.length }))
    .sort((x, y) => x.mean - y.mean);
  const maxGap = Math.max(10, ...rows.map((a) => a.mean));
  return h("table", { class: "grid" },
    h("thead", {}, h("tr", {}, [t("Agent"), t("Instances"), t("Mean gap"), t("Best of the batch"), t("Optimum reached")].map((t) => h("th", {}, t)))),
    h("tbody", {}, rows.map((a, k) => h("tr", { class: k === 0 && rows.length > 1 ? "best" : "" },
      h("td", {}, h("b", {}, a.name), KIND_NOTE[a.kind] ? h("span", { class: "muted" }, KIND_NOTE[a.kind]) : null),
      h("td", { class: "num" }, a.gaps.length),
      h("td", {}, h("span", { class: "gapbar" }, h("i", { style: { width: `${(100 * Math.max(0, a.mean)) / maxGap}%` } })),
        h("span", { class: "mono" }, fmt.pct(a.mean))),
      h("td", { class: "num" }, t("{n} of {total}", { n: a.wins, total: a.gaps.length })),
      h("td", { class: "num" }, a.optimal)))));
}
