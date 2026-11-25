// Toasts and the shared tooltip.

import { esc, h } from "./dom.js";

export function toast(msg, kind = "") {
  const t = h("div", { class: `toast ${kind}` }, msg);
  document.getElementById("toasts").append(t);
  setTimeout(() => t.remove(), kind === "error" ? 7000 : 3500);
}

const tip = () => document.getElementById("tooltip");
export function showTip(html, x, y) {
  const t = tip();
  t.innerHTML = html;
  t.classList.add("on");
  const r = t.getBoundingClientRect();
  let left = x + 14, top = y + 14;
  if (left + r.width > innerWidth - 8) left = x - r.width - 14;
  if (top + r.height > innerHeight - 8) top = y - r.height - 14;
  t.style.left = `${left}px`;
  t.style.top = `${top}px`;
}
export function hideTip() { tip().classList.remove("on"); }

export function ttRows(rows) {
  return rows.map(([k, v]) => `<div class="tt-row"><span>${esc(k)}</span><span>${esc(v)}</span></div>`).join("");
}
