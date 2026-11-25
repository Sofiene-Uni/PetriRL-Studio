// Dropdown pickers for instances and agents, built on multi-select.
import { api } from "../core/api.js";
import { fmt } from "../core/format.js";
import { refText } from "../core/reference.js";
import { envOf, refreshLibrary, state } from "../core/state.js";
import { toast } from "../core/ui.js";
import { multiSelect } from "./multi-select.js";

const WAIT = { on: "wait always", gt: "wait if useful" };

export function instancePicker(selected, onChange) {
  const item = (i) => ({
    id: i.id, label: i.name, badge: `${i.n_jobs}×${i.n_machines}`, removable: i.source !== "benchmark",
    meta: (i.matches ? `same as ${i.matches.split(":")[1]}, ` : "") + refText(i.reference),
    search: `${i.family_name || ""} ${i.original_name || ""}`,
  });
  const groups = () => {
    const out = [];
    const bench = state.instances.filter((i) => i.source === "benchmark");
    for (const fam of [...new Set(bench.map((i) => i.family_name))]) {
      out.push({ title: fam, bulk: true, items: bench.filter((i) => i.family_name === fam).map(item) });
    }
    out.push({ title: "Your uploads", bulk: true, items: state.instances.filter((i) => i.source === "upload").map(item) });
    out.push({ title: "Random instances", bulk: true, items: state.instances.filter((i) => i.source === "random").map(item) });
    return out;
  };
  return multiSelect({
    placeholder: "Choose instances", searchHint: "Search: ta, dmu, 15×15, Taillard…", groups, selected, onChange,
    onRemove: async (it) => {
      try {
        await api(`/api/instances/${it.id}`, { method: "DELETE" });
        selected.delete(it.id);
        await refreshLibrary();
      } catch (e) { toast(e.message, "error"); }
    },
  });
}

// instances(): the instances selected elsewhere, to tag each agent with whether it fits their size.
// envFilter(): an env name to list only its learned agents, or "all". Rules are always listed (baselines).
export function agentPicker(selected, onChange, instances, envFilter = () => "all") {
  const fit = (a) => {
    if (a.kind === "rule") return { tag: "any size" };
    const insts = instances();
    if (!insts.length) return {};
    const n = insts.filter((i) => i.n_jobs === a.n_jobs && i.n_machines === a.n_machines).length;
    if (n === insts.length) return { tag: insts.length > 1 ? `fits all ${n}` : "fits", tagKind: "green" };
    if (n) return { tag: `fits ${n} of ${insts.length}`, tagKind: "amber" };
    return { tag: "other size", tagKind: "red", muted: true };
  };
  const meta = (a) => [envOf(a.env || "basic").title.toLowerCase() + (a.commitment_length ? `, k = ${a.commitment_length}` : ""),
    a.steps ? `${fmt.int(a.steps)} steps` : null, a.reward ? `reward ${a.reward}` : null,
    WAIT[a.standby] || null, a.best_makespan ? `best ${a.best_makespan}` : null,
    a.trained_on?.length ? `on ${a.trained_on.join(", ")}` : null].filter(Boolean).join(", ");
  const groups = () => [
    ["stock", "Stock agents"], ["trained", "Trained here"], ["uploaded", "Uploaded"], ["rule", "Dispatching rules"],
  ].map(([src, title]) => ({
    title,
    items: state.agents.filter((a) => a.source === src && (a.kind === "rule" || envFilter() === "all" || (a.env || "basic") === envFilter())).map((a) => ({
      id: a.id, label: a.name, meta: a.kind === "rule" ? a.description : meta(a),
      badge: a.kind === "rule" ? null : `${a.n_jobs}×${a.n_machines}`,
      removable: a.source === "trained" || a.source === "uploaded", ...fit(a),
    })),
  }));
  return multiSelect({
    placeholder: "Choose agents or rules", searchHint: "Search agents and rules", groups, selected, onChange,
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
