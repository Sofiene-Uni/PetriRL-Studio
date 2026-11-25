// Benchmarks: problem type -> family -> instances, with bounds, status (optimum proven or open) and your best run.
import { api } from "../core/api.js";
import { h } from "../core/dom.js";
import { fmt } from "../core/format.js";
import { state } from "../core/state.js";

const size = (i) => `${i.n_jobs}×${i.n_machines}`;

export async function benchmarksView(root, familyId) {
  const data = await api("/api/benchmarks");
  const families = data.problem_types.flatMap((t) => t.families);
  let current = families.find((f) => f.id === familyId) || families.find((f) => f.id === "ta") || families[0];
  const picked = new Set();

  const detail = h("section", { class: "panel" });
  const cards = new Map();

  const familyCard = (f) => {
    const ops = f.instances.map((i) => i.n_ops);
    const small = f.instances[ops.indexOf(Math.min(...ops))], big = f.instances[ops.indexOf(Math.max(...ops))];
    const solved = f.instances.filter((i) => i.reference.kind === "optimum").length;
    const yours = f.instances.filter((i) => i.best_run).length;
    const card = h("button", { type: "button", class: "fam-card", onclick: () => select(f) },
      h("span", { class: "fam-year" }, f.year),
      h("h3", {}, f.name),
      h("span", { class: "fam-count" }, `${f.instances.length} instance${f.instances.length > 1 ? "s" : ""}, ${size(small) === size(big) ? size(small) : `${size(small)} to ${size(big)}`}`),
      h("span", { class: "fam-bar", title: `${solved} of ${f.instances.length} solved to optimality` },
        h("i", { style: { width: `${(100 * solved) / f.instances.length}%` } })),
      h("span", { class: "fam-meta" }, `${solved} optimal, ${f.instances.length - solved} open`, yours ? h("b", {}, `you: ${yours}`) : null));
    cards.set(f.id, card);
    return card;
  };

  const select = (f) => {
    current = f;
    picked.clear();
    cards.forEach((c, id) => c.classList.toggle("on", id === f.id));
    history.replaceState(null, "", `#/benchmarks/${f.id}`);
    renderDetail();
  };

  const renderDetail = () => {
    const f = current;
    const solveBtn = h("button", { class: "btn primary", disabled: !picked.size, onclick: () => {
      state.pickedInstances.clear();
      picked.forEach((id) => state.pickedInstances.add(id));
      state.lastResults = null;
      location.hash = "#/solve";
    } }, picked.size ? `Solve ${picked.size} selected` : "Solve selected");
    const toggle = (ids, on) => { ids.forEach((id) => (on ? picked.add(id) : picked.delete(id))); renderDetail(); };
    const allIds = f.instances.map((i) => i.id);

    const groups = new Map();
    for (const i of f.instances) {
      if (!groups.has(size(i))) groups.set(size(i), []);
      groups.get(size(i)).push(i);
    }
    const body = h("tbody");
    for (const [sz, items] of groups) {
      const ids = items.map((i) => i.id), allOn = ids.every((id) => picked.has(id));
      if (groups.size > 1) {
        body.append(h("tr", { class: "group-row" }, h("td", { colspan: 7 },
          h("b", {}, sz), h("span", { class: "muted" }, ` ${items.length} instance${items.length > 1 ? "s" : ""}`),
          h("button", { class: "ms-bulk", onclick: () => toggle(ids, !allOn) }, allOn ? "Clear" : "Select these"))));
      }
      for (const i of items) body.append(row(i, () => toggle([i.id], !picked.has(i.id))));
    }

    detail.replaceChildren(
      h("div", { class: "panel-head" },
        h("div", {}, h("h2", {}, `${f.name} (${f.year})`), h("p", {}, f.reference)),
        h("div", { class: "toolbar" },
          h("button", { class: "btn small ghost", onclick: () => toggle(allIds, picked.size !== allIds.length) },
            picked.size === allIds.length ? "Clear" : `Select all ${allIds.length}`),
          solveBtn)),
      h("table", { class: "grid bench" },
        h("thead", {}, h("tr", {}, ["", "Instance", "Size", "Lower bound", "Best known", "Status", "Your best"].map((t) => h("th", {}, t)))),
        body));

    function row(i, onToggle) {
      const lit = i.literature, on = picked.has(i.id);
      const open = lit.best_known > lit.lower_bound;
      const own = i.reference.source === "your value";
      return h("tr", { class: `click${on ? " on" : ""}`, onclick: onToggle },
        h("td", {}, h("span", { class: "tick" })),
        h("td", {}, h("b", {}, i.name), i.original_name ? h("span", { class: "muted" }, ` ${i.original_name}`) : null),
        h("td", {}, h("span", { class: "size" }, size(i))),
        h("td", { class: "num", title: lit.lower_bound_ref }, lit.lower_bound),
        h("td", { class: "num", title: own ? "your value" : lit.best_known_ref }, own ? h("span", {}, i.reference.value, h("small", { class: "muted" }, " yours")) : lit.best_known),
        h("td", {}, open ? h("span", { class: "chip amber" }, `open, ${fmt.pct((100 * (lit.best_known - lit.lower_bound)) / lit.lower_bound)} apart`)
          : h("span", { class: "chip green" }, "optimum proven")),
        h("td", {}, i.best_run ? h("a", { href: `#/run/${i.best_run.id}`, class: "best-link", onclick: (e) => e.stopPropagation() },
          h("b", { class: "mono" }, i.best_run.makespan), " ", h("span", { class: "mono muted" }, fmt.pct(i.best_run.gap)),
          h("span", { class: "muted" }, ` ${i.best_run.agent.name}`)) : h("span", { class: "muted" }, "–")));
    }
  };

  root.replaceChildren(...[
    h("div", { class: "page-head" }, h("div", {}, h("h1", {}, "Benchmarks"),
      h("p", {}, "The classic instances of each problem type, with their proven lower bound and best known solution. " +
        "The gap of every run is measured to the optimum when it is proven, otherwise to the best known solution."))),
    ...data.problem_types.map((t) => h("section", { class: "ptype" },
      h("div", { class: "ptype-head" }, h("h2", {}, t.name), h("p", {}, t.description)),
      h("div", { class: "fam-grid" }, t.families.map(familyCard)))),
    detail,
    data.source ? h("p", { class: "formats", style: { marginTop: "14px" } }, `Bounds: ${data.source} Hover a bound for its reference.`) : null]
    .filter(Boolean));
  select(current);
}
