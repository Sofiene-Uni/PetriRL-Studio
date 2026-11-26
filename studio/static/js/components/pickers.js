// Dropdown pickers for instances and agents, built on multi-select.
import { api } from "../core/api.js";
import { fmt } from "../core/format.js";
import { refText } from "../core/reference.js";
import { envOf, refreshLibrary, state } from "../core/state.js";
import { toast } from "../core/ui.js";
import { multiSelect } from "./multi-select.js";
import { t } from "../core/i18n.js";

const WAIT = { get on() { return t("wait always"); }, get gt() { return t("wait if useful"); } };

export function instancePicker(selected, onChange) {
  const item = (i) => ({
    id: i.id, label: i.name, badge: `${i.n_jobs}×${i.n_machines}`, removable: !state.public && i.source !== "benchmark",
    meta: (i.matches ? `same as ${i.matches.split(":")[1]}, ` : "") + refText(i.reference),
    search: `${i.family_name || ""} ${i.original_name || ""}`,
  });
  const group = (title, list) => ({ title, bulk: true, meta: sizes(list), items: list.map(item) });
  const groups = () => {
    const bench = state.instances.filter((i) => i.source === "benchmark");
    return [
      ...[...new Set(bench.map((i) => i.family_name))].map((fam) => group(fam, bench.filter((i) => i.family_name === fam))),
      group(t("Your uploads"), state.instances.filter((i) => i.source === "upload")),
      group(t("Random instances"), state.instances.filter((i) => i.source === "random")),
    ];
  };
  return multiSelect({
    placeholder: t("Choose a benchmark, then instances"), searchHint: t("Search all: ta, dmu, 15×15, Taillard…"),
    groups, selected, onChange, browse: true,
    onRemove: async (it) => {
      try {
        await api(`/api/instances/${it.id}`, { method: "DELETE" });
        selected.delete(it.id);
        await refreshLibrary();
      } catch (e) { toast(e.message, "error"); }
    },
  });
}

// "6×6 to 15×15" for the instances of a group
function sizes(list) {
  const keys = [...new Set(list.map((i) => `${i.n_jobs}×${i.n_machines}`))];
  return keys.length > 3 ? `${keys[0]} to ${keys[keys.length - 1]}` : keys.join(", ");
}

// instances(): the instances selected elsewhere, to tag each agent with whether it fits their size.
// RL agents are those of the environment chosen at the top of the app; rules and metaheuristics work in any.
export const anySize = (a) => a.kind === "rule" || a.kind === "meta";
const SOURCE = { stock: "stock", trained: "trained here", uploaded: "uploaded" };   // translated where shown

export function agentPicker(selected, onChange, instances) {
  const fit = (a) => {
    if (a.kind === "solution") {
      const insts = instances(), n = insts.filter((i) => i.known_solution).length;
      if (!insts.length) return { tag: t("stored ones") };
      return n === insts.length ? { tag: t("stored"), tagKind: "green" }
        : n ? { tag: t("stored for {n} of {total}", { n, total: insts.length }), tagKind: "amber" } : { tag: t("none stored"), tagKind: "red", muted: true };
    }
    if (anySize(a)) return { tag: t("any size") };
    const insts = instances();
    if (!insts.length) return {};
    const n = insts.filter((i) => i.n_jobs === a.n_jobs && i.n_machines === a.n_machines).length;
    if (n === insts.length) return { tag: insts.length > 1 ? t("fits all {n}", { n }) : t("fits"), tagKind: "green" };
    if (n) return { tag: t("fits {n} of {total}", { n, total: insts.length }), tagKind: "amber" };
    return { tag: t("other size"), tagKind: "red", muted: true };
  };
  const meta = (a) => [SOURCE[a.source] && t(SOURCE[a.source]), a.commitment_length ? `k = ${a.commitment_length}` : null,
    a.steps ? t("{n} steps", { n: fmt.int(a.steps) }) : null, a.reward ? t("reward {r}", { r: a.reward }) : null,
    WAIT[a.standby] || null, a.best_makespan ? t("best {n}", { n: a.best_makespan }) : null,
    a.trained_on?.length ? t("on {list}", { list: a.trained_on.join(", ") }) : null].filter(Boolean).join(", ");
  const item = (a) => ({
    id: a.id, label: t(a.name), meta: anySize(a) ? t(a.description) : meta(a), badge: anySize(a) ? null : `${a.n_jobs}×${a.n_machines}`,
    removable: !state.public && (a.source === "trained" || a.source === "uploaded"), ...fit(a),
  });
  const groups = () => {
    const env = envOf(state.env);
    const rl = state.agents.filter((a) => !anySize(a) && (a.env || "basic") === state.env);
    return [
      { title: t("RL agents"), meta: t("PPO agents for the {env} environment", { env: t(env.title) }), items: rl.map(item) },
      { title: t("Dispatching rules"), meta: t("one rule decides every step"), items: state.agents.filter((a) => a.kind === "rule").map(item) },
      { title: t("Metaheuristics"), meta: t("search a job priority, then dispatch with it"), items: state.agents.filter((a) => a.kind === "meta").map(item) },
      { title: t("Stored solutions"), meta: t("replay a solution shipped with the app"), items: state.agents.filter((a) => a.kind === "solution").map(item) },
    ];
  };
  return multiSelect({
    placeholder: t("Choose RL agents, rules or metaheuristics"), searchHint: t("Search all agents and methods"), groups, selected, onChange,
    browse: true,
    onRemove: async (it) => {
      if (!confirm(`Delete agent "${it.label}"?`)) return;
      try {
        await api(`/api/agents/${it.id}`, { method: "DELETE" });
        selected.delete(it.id);
        await refreshLibrary();
      } catch (e) { toast(e.message, "error"); }
    },
  });
}
