// Instance actions shared by Solve and Train: upload dropped files, generate a random instance.
import { api } from "../core/api.js";
import { h } from "../core/dom.js";
import { refreshLibrary } from "../core/state.js";
import { toast } from "../core/ui.js";

export async function uploadInstances(files) {
  const fd = new FormData();
  files.forEach((f) => fd.append("files", f));
  const res = await api("/api/instances", { method: "POST", body: fd });
  for (const e of res.errors) toast(`${e.file}: ${e.error}`, "error");
  if (res.added.length) toast(`Added ${res.added.map((a) => `${a.name} (${a.n_jobs}×${a.n_machines})`).join(", ")}`);
  await refreshLibrary();
  return res.added;
}

export function randomForm(onAdded) {
  const nj = h("input", { class: "input", type: "number", min: 2, max: 100, value: 6, "aria-label": "Jobs" });
  const nm = h("input", { class: "input", type: "number", min: 2, max: 50, value: 6, "aria-label": "Machines" });
  const pmax = h("input", { class: "input", type: "number", min: 1, max: 999, value: 99, "aria-label": "Longest process time" });
  return h("div", { class: "gen" },
    h("label", { class: "field" }, h("span", {}, "Jobs"), nj),
    h("label", { class: "field" }, h("span", {}, "Machines"), nm),
    h("label", { class: "field" }, h("span", {}, "Max time"), pmax),
    h("button", { class: "btn small", onclick: async () => {
      try {
        const rec = await api("/api/instances/random", { json: { n_jobs: +nj.value, n_machines: +nm.value, p_min: 1, p_max: +pmax.value } });
        await refreshLibrary();
        toast(`Generated ${rec.name}`);
        onAdded(rec);
      } catch (e) { toast(e.message, "error"); }
    } }, "Generate random"));
}
