// Reference value of an instance for the gap: optimum, best known solution, or computed lower bound.
import { h } from "./dom.js";

export const REF_NAME = { optimum: "Optimum", "best known": "Best known", "lower bound": "Lower bound" };
export const REF_SHORT = { optimum: "Opt", "best known": "BKS", "lower bound": "LB" };

// one line for menus: "optimum 55" / "best known 2005, lower bound 1906"
export function refText(ref) {
  if (!ref) return "";
  if (ref.kind === "best known") return `best known ${ref.value}, lower bound ${ref.lower_bound}`;
  return `${ref.kind} ${ref.value}`;
}

export function refCell(ref) {
  if (!ref) return h("span", { class: "muted" }, "–");
  const kind = { optimum: "green", "best known": "blue", "lower bound": "" }[ref.kind];
  return h("span", { class: "ref-cell" }, h("b", { class: "mono" }, ref.value), " ", h("span", { class: `chip ${kind}` }, ref.kind));
}
