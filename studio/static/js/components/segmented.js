// Segmented control (one choice among a few).
import { h } from "../core/dom.js";

export function seg(options, value, onChange) {
  const box = h("div", { class: "seg", role: "group" });
  const render = () => box.replaceChildren(...options.map(([k, label]) =>
    h("button", { class: k === value ? "on" : "", "aria-pressed": k === value, onclick: () => { value = k; render(); onChange(k); } }, label)));
  render();
  return box;
}
