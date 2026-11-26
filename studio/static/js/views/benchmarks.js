// Benchmarks: problem type -> family -> instances, with bounds, status (optimum proven or open) and your best run.
import { api } from "../core/api.js";
import { h } from "../core/dom.js";
import { fmt } from "../core/format.js";
import { state } from "../core/state.js";
import { toast } from "../core/ui.js";
import { t } from "../core/i18n.js";

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
      h("span", { class: "fam-count" }, t("{n} instances, {sizes}", { n: f.instances.length, sizes: size(small) === size(big) ? size(small) : `${size(small)}–${size(big)}` })),
      h("span", { class: "fam-bar", title: t("{n} of {total} solved to optimality", { n: solved, total: f.instances.length }) },
        h("i", { style: { width: `${(100 * solved) / f.instances.length}%` } })),
      h("span", { class: "fam-meta" }, t("{n} optimal, {open} open", { n: solved, open: f.instances.length - solved }), yours ? h("b", {}, t("you: {n}", { n: yours })) : null));
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
    const taillard = f.id === "ta";                      // optimizizer.com has the Taillard solutions
    const missing = f.instances.filter((i) => !i.known_solution).map((i) => i.id);
    const solveBtn = h("button", { class: "btn primary", disabled: !picked.size, onclick: () => {
      state.pickedInstances.clear();
      picked.forEach((id) => state.pickedInstances.add(id));
      state.lastResults = null;
      location.hash = "#/solve";
    } }, picked.size ? t("Solve {n} selected", { n: picked.size }) : t("Solve selected"));
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
        body.append(h("tr", { class: "group-row" }, h("td", { colspan: 8 },
          h("b", {}, sz), h("span", { class: "muted" }, ` ${t("{n} instances", { n: items.length })}`),
          h("button", { class: "ms-bulk", onclick: () => toggle(ids, !allOn) }, allOn ? "Clear" : t("Select these")))));
      }
      for (const i of items) body.append(row(i, () => toggle([i.id], !picked.has(i.id))));
    }

    const getAll = taillard && missing.length ? h("button", { class: "btn small", onclick: async (e) => {
      const btn = e.currentTarget;
      btn.disabled = true;
      let got = 0;
      for (let k = 0; k < missing.length; k += 5) {
        btn.textContent = t("Getting solutions {a} to {b} of {n}", { a: k + 1, b: Math.min(k + 5, missing.length), n: missing.length });
        try { got += (await fetchSolutions(missing.slice(k, k + 5))).length; } catch (err) { toast(err.message, "error"); break; }
      }
      toast(t("{n} solutions stored from optimizizer.com", { n: got }));
      renderDetail();
    } }, t("Get {n} solutions from optimizizer.com", { n: missing.length })) : null;

    detail.replaceChildren(...[
      h("div", { class: "panel-head" },
        h("div", {}, h("h2", {}, `${f.name} (${f.year})`), h("p", {}, f.reference)),
        h("div", { class: "toolbar" }, getAll,
          h("button", { class: "btn small ghost", onclick: () => toggle(allIds, picked.size !== allIds.length) },
            picked.size === allIds.length ? "Clear" : t("Select all {n}", { n: allIds.length })),
          solveBtn)),
      h("table", { class: "grid bench" },
        h("thead", {}, h("tr", {}, ["", t("Instance"), t("Size"), t("Lower bound"), t("Best known"), t("Status"), t("Your best"), t("Solution")].map((t) => h("th", {}, t)))),
        body),
      taillard ? h("p", { class: "formats" }, t("Taillard solutions: "),
        h("a", { href: "https://optimizizer.com/TA.php", target: "_blank", rel: "noopener" }, "optimizizer.com"),
        ", maintained by Oleg Shylo. Each one is checked by replaying it on the Petri net, and every replay cites the page.") : null]
      .filter(Boolean));

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
        h("td", {}, open ? h("span", { class: "chip amber" }, t("open, {pct} apart", { pct: fmt.pct((100 * (lit.best_known - lit.lower_bound)) / lit.lower_bound) }))
          : h("span", { class: "chip green" }, t("optimum proven"))),
        h("td", {}, i.best_run ? h("a", { href: `#/run/${i.best_run.id}`, class: "best-link", onclick: (e) => e.stopPropagation() },
          h("b", { class: "mono" }, i.best_run.makespan), " ", h("span", { class: "mono muted" }, fmt.pct(i.best_run.gap)),
          h("span", { class: "muted" }, ` ${t(i.best_run.agent.name)}`)) : h("span", { class: "muted" }, "–")),
        h("td", {}, solutionCell(i)));
    }

    // best known solution: replay it, or download it (Taillard, from optimizizer.com)
    function solutionCell(i) {
      const stop = (e) => e.stopPropagation();
      if (i.known_solution) {
        return h("button", { class: "btn small", onclick: async (e) => {
          stop(e);
          try { location.hash = `#/run/${(await api("/api/solutions/replay", { json: { instance_id: i.id } })).id}`; }
          catch (err) { toast(err.message, "error"); }
        } }, t("Replay {n}", { n: i.known_solution }));
      }
      if (!taillard) return h("span", { class: "muted" }, "–");
      return h("button", { class: "btn small ghost", title: t("Download it from optimizizer.com"), onclick: async (e) => {
        stop(e);
        e.currentTarget.disabled = true;
        try { if ((await fetchSolutions([i.id])).length) renderDetail(); } catch (err) { toast(err.message, "error"); }
      } }, t("Get"));
    }
  };

  async function fetchSolutions(ids) {
    const res = await api("/api/solutions/fetch", { json: { instance_ids: ids } });
    for (const d of res.done) {
      const inst = current.instances.find((i) => i.id === d.instance_id);
      if (inst) inst.known_solution = d.makespan;
      const lib = state.instances.find((i) => i.id === d.instance_id);
      if (lib) lib.known_solution = true;
    }
    for (const fail of res.failed) toast(fail.error, "error");
    return res.done;
  }

  root.replaceChildren(...[
    h("div", { class: "page-head" }, h("div", {}, h("h1", {}, t("Benchmarks")),
      h("p", {}, t("The classic instances of each problem type, with their proven lower bound and best known solution. The gap of every run is measured to the optimum when it is proven, otherwise to the best known solution.")))),
    ...data.problem_types.map((pt) => h("section", { class: "ptype" },
      h("div", { class: "ptype-head" }, h("h2", {}, t(pt.name)), h("p", {}, t(pt.description))),
      h("div", { class: "fam-grid" }, pt.families.map(familyCard)))),
    detail,
    data.source ? h("p", { class: "formats", style: { marginTop: "14px" } }, t("Bounds: {source} Hover a bound for its reference.", { source: data.source })) : null]
    .filter(Boolean));
  select(current);
}
