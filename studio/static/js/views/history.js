// History: every solved run.
import { resultsTable } from "../components/results-table.js";
import { api } from "../core/api.js";
import { h } from "../core/dom.js";

export async function historyView(root) {
  const runs = await api("/api/runs");
  root.replaceChildren(
    h("div", { class: "page-head" },
      h("div", {}, h("h1", {}, "History"), h("p", {}, "Every solved run is kept. Open one to see its plan and replay it."))),
    runs.length
      ? h("div", { class: "panel" }, resultsTable(runs, { showDate: true }))
      : h("div", { class: "empty" }, h("b", {}, "No runs yet"), "Solve an instance and it will show up here. ",
        h("a", { href: "#/solve" }, "Go to Solve")));
}
