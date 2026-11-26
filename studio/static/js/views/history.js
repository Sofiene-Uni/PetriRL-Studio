// History: every solved run.
import { resultsTable } from "../components/results-table.js";
import { api } from "../core/api.js";
import { h } from "../core/dom.js";
import { t } from "../core/i18n.js";

export async function historyView(root) {
  const runs = await api("/api/runs");
  root.replaceChildren(
    h("div", { class: "page-head" },
      h("div", {}, h("h1", {}, t("History")), h("p", {}, t("Every solved run is kept. Open one to see its plan and replay it.")))),
    runs.length
      ? h("div", { class: "panel" }, resultsTable(runs, { showDate: true }))
      : h("div", { class: "empty" }, h("b", {}, t("No runs yet")), t("Solve an instance and it will show up here. "),
        h("a", { href: "#/solve" }, t("Go to Solve"))));
}
