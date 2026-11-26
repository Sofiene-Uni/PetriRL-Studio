// Actor policy view: a small picture of the policy network (state -> hidden layers -> actions) that pulses on
// each decision, the action probabilities, and how confident the agent is.
//
// confidence = 1 - H(p) / log(n) over the n enabled actions: 1 = all weight on one action, 0 = uniform.
import { h, s } from "../core/dom.js";
import { simPalette } from "../core/sim-theme.js";
import { t } from "../core/i18n.js";

const W = 264, ROW = 19, MAX_OUT = 6;
const LEVELS = () => [[0.7, t("Confident"), "#1E9E6A"], [0.4, t("Leaning"), "#E09A2C"], [0, t("Unsure"), "#D2453B"]];

export function confidence(probs) {
  const p = Object.values(probs || {});
  if (p.length <= 1) return null;                         // forced: one enabled action
  const H = -p.reduce((a, x) => a + (x > 0 ? x * Math.log(x) : 0), 0);
  return Math.max(0, Math.min(1, 1 - H / Math.log(p.length)));
}

export function level(c) { return LEVELS().find(([t]) => c >= t); }

const reduced = () => matchMedia("(prefers-reduced-motion: reduce)").matches;

export class PolicyView {
  constructor(container, { hidden = null, nObs = null } = {}) {
    this.el = h("div", { class: "policy" });
    container.append(this.el);
    this.hidden = hidden;
    this.nObs = nObs;
    this.last = null;                            // last show / showRule call, replayed when the theme changes
    this.onTheme = () => this.last && this[this.last[0]](...this.last[1], { animate: false });
    document.addEventListener("simthemechange", this.onTheme);
  }

  destroy() { document.removeEventListener("simthemechange", this.onTheme); }

  // probs: {action key: probability} over the enabled actions; chosen: the key taken;
  // keys: every action key (the masked ones are keys - enabled); labelOf / colorOf: display of a key
  show(input, { animate = true } = {}) {
    this.last = ["show", [input]];
    const { probs, chosen, keys, enabled, labelOf, colorOf } = input;
    const P = simPalette();
    const actions = Object.entries(probs || {}).map(([k, p]) => ({ key: k, p })).sort((a, b) => b.p - a.p);
    const shown = actions.slice(0, MAX_OUT);
    const rest = actions.slice(MAX_OUT).reduce((a, x) => a + x.p, 0);
    const chosenKey = chosen;
    const nOut = shown.length + (rest > 0 ? 1 : 0);
    const H = Math.max(5, nOut) * ROW + 24;
    const svg = s("svg", { viewBox: `0 0 ${W} ${H}`, width: "100%", role: "img",
      "aria-label": `Policy output: ${actions.map((a) => `${labelOf(a.key)} ${(a.p * 100).toFixed(0)}%`).join(", ")}` });

    // layers: state (5 nodes), hidden layers (5 nodes each), outputs (one per shown action)
    const xs = [10, 52, 94, 140];
    const col = (n, x) => Array.from({ length: n }, (_, i) => ({ x, y: 14 + ((H - 28) * (i + 0.5)) / n }));
    const layers = [col(5, xs[0]), col(5, xs[1]), col(5, xs[2])];
    const outs = shown.map((a, i) => ({ ...a, x: xs[3], y: 14 + ROW * (i + 0.5) + (H - 28 - ROW * nOut) / 2 }));
    const edgesG = s("g", { stroke: P.edge, "stroke-width": 0.7 });
    const edgeSets = [];
    for (let k = 0; k < layers.length; k++) {
      const from = layers[k], to = k + 1 < layers.length ? layers[k + 1] : outs;
      const set = [];
      for (const a of from) for (const b of to) {
        const toChosen = k === layers.length - 1 && b.key === chosenKey;
        const line = s("line", { x1: a.x, y1: a.y, x2: b.x, y2: b.y, "stroke-opacity": toChosen ? 0.5 : 0.18,
          stroke: toChosen ? P.fire : null });
        edgesG.append(line);
        set.push(line);
      }
      edgeSets.push(set);
    }
    svg.append(edgesG);
    const nodes = s("g");
    for (const layer of layers) for (const n of layer) nodes.append(s("circle", { cx: n.x, cy: n.y, r: 3.2, fill: P.node }));
    svg.append(nodes);
    svg.append(s("text", { x: xs[0], y: H - 2, "font-size": 8.5, fill: P.label, "text-anchor": "middle" }, "state",
      this.nObs ? s("title", {}, `${this.nObs} observation features`) : null));
    svg.append(s("text", { x: (xs[1] + xs[2]) / 2, y: H - 2, "font-size": 8.5, fill: P.label, "text-anchor": "middle" },
      this.hidden ? this.hidden.join(" × ") : "hidden"));
    svg.append(s("text", { x: xs[3], y: H - 2, "font-size": 8.5, fill: P.label, "text-anchor": "middle" }, "actions"));

    // outputs: node sized by probability, label, bar, percent
    const bars = [];
    for (const o of outs) {
      const chosen = o.key === chosenKey;
      const color = colorOf(o.key);
      const g = s("g");
      g.append(s("circle", { cx: o.x, cy: o.y, r: 2.5 + 5.5 * Math.sqrt(o.p), fill: color, stroke: chosen ? P.fire : "none", "stroke-width": 2 }));
      g.append(s("text", { x: o.x + 12, y: o.y + 3.5, "font-size": 10.5, fill: chosen ? P.strong : P.muted, "font-weight": chosen ? 700 : 400 },
        labelOf(o.key)));
      g.append(s("rect", { x: 182, y: o.y - 3.5, width: 50, height: 7, rx: 3.5, fill: P.track }));
      const bar = s("rect", { x: 182, y: o.y - 3.5, width: 0, height: 7, rx: 3.5, fill: color });
      g.append(bar);
      g.append(s("text", { x: W - 2, y: o.y + 3.5, "font-size": 10, "text-anchor": "end", fill: chosen ? P.strong : P.muted,
        "font-family": "JetBrains Mono, monospace" }, `${Math.round(o.p * 100)}%`));
      svg.append(g);
      bars.push([bar, Math.max(1, 50 * o.p)]);
    }
    if (rest > 0) {
      svg.append(s("text", { x: xs[3] + 12, y: 14 + ROW * (nOut - 0.5) + (H - 28 - ROW * nOut) / 2 + 3.5, "font-size": 10, fill: P.label },
        `${actions.length - MAX_OUT} more, ${Math.round(rest * 100)}%`));
    }

    const c = confidence(probs);
    this.el.replaceChildren(svg, this.gauge(c), maskedRow(keys, enabled, labelOf, animate));

    // animation: the signal crosses the layers, then the bars grow
    const anim = animate && !reduced();
    edgeSets.forEach((set, k) => {
      if (!anim) return;
      for (const line of set) {
        const base = +line.getAttribute("stroke-opacity");
        line.animate([{ strokeOpacity: base }, { strokeOpacity: 0.95 }, { strokeOpacity: base }],
          { duration: 260, delay: k * 110, easing: "ease-out" });
      }
    });
    for (const [bar, w] of bars) {
      if (anim) bar.animate([{ width: 0 }, { width: w }], { duration: 380, delay: edgeSets.length * 110, easing: "cubic-bezier(.2,.8,.2,1)", fill: "forwards" });
      bar.setAttribute("width", w);
    }
  }

  gauge(c) {
    const box = h("div", { class: "conf" });
    if (c == null) {
      box.append(h("span", { class: "conf-label" }, t("Forced: only one action was enabled")));
      return box;
    }
    const [, name, color] = level(c);
    const R = 22, len = Math.PI * R;
    const svg = s("svg", { viewBox: "0 0 56 32", width: 56, height: 32 },
      s("path", { d: `M6,28 A${R},${R} 0 0 1 50,28`, fill: "none", stroke: simPalette().track, "stroke-width": 5, "stroke-linecap": "round" }),
      s("path", { class: "conf-arc", d: `M6,28 A${R},${R} 0 0 1 50,28`, fill: "none", stroke: color, "stroke-width": 5, "stroke-linecap": "round",
        "stroke-dasharray": `${c * len} ${len}` }));
    box.append(svg, h("span", { class: "conf-label" }, h("b", { style: { color } }, name), ` ${Math.round(c * 100)}% confidence`));
    if (!reduced()) svg.querySelector(".conf-arc").animate([{ strokeDasharray: `0 ${len}` }, { strokeDasharray: `${c * len} ${len}` }],
      { duration: 450, delay: 300, easing: "ease-out" });
    return box;
  }

  showRule(ruleName, input, { animate = true } = {}) {
    this.last = ["showRule", [ruleName, input]];
    const { keys, enabled, labelOf } = input;
    this.el.replaceChildren(h("p", { class: "conf-label", style: { padding: "4px 0" } },
      `${ruleName} is a fixed rule: it always picks the same job in the same state, so it has no probabilities. ` +
      `${enabled.length} action${enabled.length === 1 ? " was" : "s were"} enabled.`),
    maskedRow(keys, enabled, labelOf, animate));
  }
}

// The actions the guard function did not enable at this decision: the agent cannot pick them.
function maskedRow(keys, enabled, labelOf, animate) {
  const on = new Set(enabled);
  const masked = keys.filter((k) => !on.has(k));
  if (!masked.length) return h("div", { class: "masked-row" }, h("span", { class: "masked-title" }, t("Masked")), h("span", { class: "muted" }, "none, every action is enabled"));
  return h("div", { class: `masked-row${animate && !reduced() ? " animate" : ""}` },
    h("span", { class: "masked-title", title: t("Not enabled by the Petri net guard function: probability forced to 0") },
      t("Masked {n} of {total}", { n: masked.length, total: keys.length })),
    ...masked.map((k, i) => h("span", { class: "masked-chip", style: { animationDelay: `${Math.min(i, 12) * 25}ms` } }, labelOf(k))));
}

// One bar per decision over the episode: height and color by confidence; click to jump there.
export function confidenceStrip(decisions, onPick) {
  const W2 = 264, H2 = 34;
  const canvas = h("canvas", { class: "conf-strip", title: t("Agent confidence over the episode. Click to jump.") });
  let at = -1;
  const draw = (current = at) => {
    at = current;
    const P = simPalette();
    const dpr = devicePixelRatio || 1;
    canvas.width = W2 * dpr; canvas.height = H2 * dpr;
    const ctx = canvas.getContext("2d");
    ctx.scale(dpr, dpr);
    const bw = W2 / decisions.length;
    decisions.forEach((d, i) => {
      const c = confidence(d.probs);
      ctx.fillStyle = c == null ? P.track : level(c)[2];
      const hh = c == null ? 3 : 4 + c * (H2 - 6);
      ctx.fillRect(i * bw, H2 - hh, Math.max(1, bw - (bw > 3 ? 1 : 0)), hh);
    });
    if (current >= 0) {
      ctx.fillStyle = P.strong;
      ctx.fillRect(current * bw + bw / 2 - 1, 0, 2, H2);
    }
  };
  canvas.addEventListener("click", (e) => {
    const r = canvas.getBoundingClientRect();
    onPick(Math.min(decisions.length - 1, Math.floor(((e.clientX - r.left) / r.width) * decisions.length)));
  });
  draw(-1);
  const redraw = () => draw();
  document.addEventListener("simthemechange", redraw);
  return { el: canvas, draw, destroy: () => document.removeEventListener("simthemechange", redraw) };
}
