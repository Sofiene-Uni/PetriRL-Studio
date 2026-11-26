// Reference value of an instance for the gap: optimum, best known solution, or computed lower bound.
import { h } from "./dom.js";
import { t } from "./i18n.js";

// getters: the text is looked up when shown, after the language is loaded
export const REF_NAME = {
  get optimum() { return t("Optimum"); }, get "best known"() { return t("Best known"); }, get "lower bound"() { return t("Lower bound"); },
};
export const REF_SHORT = { get optimum() { return t("Opt"); }, "best known": "BKS", "lower bound": "LB" };

// one line for menus: "optimum 55" / "best known 2005, lower bound 1906"
export function refText(ref) {
  if (!ref) return "";
  if (ref.kind === "best known") return `${t("best known")} ${ref.value}, ${t("lower bound")} ${ref.lower_bound}`;
  return `${t(ref.kind)} ${ref.value}`;
}

export function refCell(ref) {
  if (!ref) return h("span", { class: "muted" }, "–");
  const kind = { optimum: "green", "best known": "blue", "lower bound": "" }[ref.kind];
  return h("span", { class: "ref-cell" }, h("b", { class: "mono" }, ref.value), " ", h("span", { class: `chip ${kind}` }, t(ref.kind)));
}
