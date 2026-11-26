// Interactive Gantt chart (SVG): machine or job rows, zoom/pan, job focus, critical path, time cursor.
import { jobColor } from "../core/colors.js";
import { s } from "../core/dom.js";
import { niceStep } from "../core/format.js";
import { simThemeName } from "../core/sim-theme.js";
import { hideTip, showTip, ttRows } from "../core/ui.js";
import { t } from "../core/i18n.js";

export class Gantt {
  constructor(container, { schedule, nJobs, nMachines, makespan, reference = null, compact = false, onSeek = null }) {
    this.el = container;
    this.ops = schedule.map((o, i) => ({ ...o, i }));
    this.nJobs = nJobs;
    this.nMachines = nMachines;
    this.makespan = makespan;
    this.reference = reference;         // { value, label } drawn as a dashed line, e.g. "Opt 55"
    this.dark = simThemeName() === "dark";       // follows the app theme
    this.compact = compact;
    this.onSeek = onSeek;
    this.mode = "machine";
    this.focus = null;
    this.showCritical = false;
    this.clock = null;                  // null: the whole plan is shown as done
    this.view = [0, makespan];
    this.critical = criticalPath(this.ops, makespan);
    this.svg = s("svg", { role: "img", "aria-label": t("Gantt chart of the schedule") });
    this.el.append(this.svg);
    this.bindEvents();
    this.ro = new ResizeObserver(() => this.layout());
    this.ro.observe(this.el);
    this.layout();
    this.onTheme = () => { this.dark = simThemeName() === "dark"; this.layout(); };
    document.addEventListener("simthemechange", this.onTheme);
  }

  destroy() { this.ro.disconnect(); this.svg.remove(); document.removeEventListener("simthemechange", this.onTheme); }

  get theme() {
    return this.dark
      ? { text: "#98A2AF", strong: "#E6EAF0", grid: "#343B45", axis: "#4A535F", cursor: "#F2A93B", crit: "#FFFFFF", bg: "transparent" }
      : { text: "#7C8592", strong: "#1E2229", grid: "#E3E7EC", axis: "#C3CAD3", cursor: "#E09A2C", crit: "#1E2229", bg: "#FBFCFD" };
  }

  rowOf(o) { return this.mode === "machine" ? o.machine - 1 : o.job - 1; }

  // ------------------------------------------------------------- geometry
  layout() {
    const W = Math.max(320, this.el.clientWidth - 16);
    const rows = this.mode === "machine" ? this.nMachines : this.nJobs;
    this.rowH = this.compact ? Math.max(9, Math.min(16, 150 / rows)) : Math.max(16, Math.min(30, 560 / rows));
    this.labelW = this.compact ? 30 : 56;
    this.top = this.compact ? 6 : 26;
    this.W = W;
    this.plotW = W - this.labelW - 14;
    this.H = this.top + rows * this.rowH + (this.compact ? 16 : 30);
    this.svg.setAttribute("viewBox", `0 0 ${W} ${this.H}`);
    this.svg.setAttribute("height", this.H);
    this.build();
  }

  x(t) { const [a, b] = this.view; return this.labelW + ((t - a) / (b - a)) * this.plotW; }
  t(x) { const [a, b] = this.view; return a + ((x - this.labelW) / this.plotW) * (b - a); }

  // ------------------------------------------------------------- drawing
  build() {
    const th = this.theme, svg = this.svg;
    svg.replaceChildren();
    const rows = this.mode === "machine" ? this.nMachines : this.nJobs;
    const plotBottom = this.top + rows * this.rowH;
    const fontSize = this.compact ? 9 : 11;

    const defs = s("defs");
    const clip = s("clipPath", { id: `gclip${this.uid ||= Math.random().toString(36).slice(2, 8)}` },
      s("rect", { x: this.labelW, y: 0, width: this.plotW, height: this.H }));
    defs.append(clip);
    svg.append(defs);
    if (!this.dark) svg.append(s("rect", { x: 0, y: 0, width: this.W, height: this.H, fill: th.bg }));

    // rows + labels
    const rowsG = s("g");
    for (let r = 0; r < rows; r++) {
      const y = this.top + r * this.rowH;
      if (r % 2 === 0) rowsG.append(s("rect", { x: this.labelW, y, width: this.plotW, height: this.rowH, fill: this.dark ? "#262C34" : "#F4F6F8" }));
      if (this.mode === "job" && !this.compact) {
        rowsG.append(s("circle", { cx: 12, cy: y + this.rowH / 2, r: 4, fill: jobColor(r + 1) }));
      }
      const label = (this.mode === "machine" ? "M" : "J") + (r + 1);
      if (!this.compact || rows <= 20) {
        rowsG.append(s("text", { x: this.labelW - 8, y: y + this.rowH / 2 + fontSize * 0.36, "text-anchor": "end",
          "font-size": fontSize, fill: th.text, "font-family": "JetBrains Mono, monospace" }, label));
      }
    }
    svg.append(rowsG);

    // time grid + axis
    const [a, b] = this.view;
    const step = niceStep(b - a, this.compact ? 6 : Math.max(4, Math.round(this.plotW / 90)));
    const grid = s("g");
    for (let t = Math.ceil(a / step) * step; t <= b + 1e-9; t += step) {
      const x = this.x(t);
      grid.append(s("line", { x1: x, x2: x, y1: this.top, y2: plotBottom, stroke: th.grid, "stroke-width": 1 }));
      if (!this.compact) grid.append(s("text", { x, y: plotBottom + 17, "text-anchor": "middle", "font-size": 11,
        fill: th.text, "font-family": "JetBrains Mono, monospace" }, Math.round(t)));
    }
    grid.append(s("line", { x1: this.labelW, x2: this.labelW + this.plotW, y1: plotBottom, y2: plotBottom, stroke: th.axis }));
    svg.append(grid);

    // reference lines: lower bound and makespan
    const refs = s("g", { "clip-path": `url(#gclip${this.uid})` });
    if (!this.compact) {
      const lines = [[this.makespan, `Cmax ${this.makespan}`, null]];
      if (this.reference && this.reference.value !== this.makespan) lines.unshift([this.reference.value, this.reference.label, "4 4"]);
      for (const [t, label, dash] of lines) {
        const x = this.x(t);
        const nearEnd = x > this.labelW + this.plotW - 80;
        refs.append(s("line", { x1: x, x2: x, y1: this.top - 6, y2: plotBottom, stroke: th.strong, "stroke-width": 1.2, "stroke-dasharray": dash, opacity: 0.7 }));
        refs.append(s("text", { x: nearEnd ? x - 4 : x + 4, y: this.top - 9, "text-anchor": nearEnd ? "end" : "start", "font-size": 11, fill: th.strong, "font-weight": 600 }, label));
      }
    }
    svg.append(refs);

    // bars
    this.barsG = s("g", { "clip-path": `url(#gclip${this.uid})` });
    this.bars = this.ops.map((o) => {
      const y = this.top + this.rowOf(o) * this.rowH + (this.compact ? 1 : 3);
      const hgt = this.rowH - (this.compact ? 2 : 6);
      const x0 = this.x(o.start), w = Math.max(1, this.x(o.end) - x0);
      const color = jobColor(o.job);
      const g = s("g", { "data-i": o.i, class: "bar" });
      const base = s("rect", { x: x0, y, width: w, height: hgt, rx: this.compact ? 1.5 : 3, fill: color });
      const prog = s("rect", { x: x0, y, width: 0, height: hgt, rx: this.compact ? 1.5 : 3, fill: color });
      g.append(base, prog);
      if (!this.compact && w > 24) {
        const label = this.mode === "machine" ? `J${o.job}` : `M${o.machine}`;
        g.append(s("text", { x: x0 + w / 2, y: y + hgt / 2 + 3.8, "text-anchor": "middle", "font-size": 10.5,
          fill: "#fff", "font-weight": 600, "pointer-events": "none" }, label));
      }
      this.barsG.append(g);
      return { o, g, base, prog, x0, w, state: null };
    });
    svg.append(this.barsG);

    // job route of the focused job, critical path outline
    this.overlay = s("g", { "clip-path": `url(#gclip${this.uid})`, "pointer-events": "none" });
    svg.append(this.overlay);

    // time cursor
    this.cursor = s("g", { "pointer-events": "none" });
    this.cursorLine = s("line", { y1: this.top - 4, y2: plotBottom, stroke: th.cursor, "stroke-width": 2 });
    this.cursorLabel = s("text", { y: plotBottom + (this.compact ? 12 : 17), "text-anchor": "middle", "font-size": 11,
      fill: th.cursor, "font-weight": 700, "font-family": "JetBrains Mono, monospace" });
    this.cursorBg = s("rect", { y: plotBottom + 4, height: 17, rx: 4, fill: this.dark ? "#2A3039" : "#FBFCFD" });
    this.cursor.append(this.cursorLine, this.cursorBg, this.cursorLabel);
    svg.append(this.cursor);

    this.paintOverlay();
    this.paintClock(true);
  }

  paintOverlay() {
    const th = this.theme;
    this.overlay.replaceChildren();
    const hgt = this.rowH - (this.compact ? 2 : 6);
    const yOf = (o) => this.top + this.rowOf(o) * this.rowH + (this.compact ? 1 : 3);
    if (this.showCritical) {
      for (const o of this.ops) {
        if (!this.critical.has(o.i)) continue;
        this.overlay.append(s("rect", { x: this.x(o.start), y: yOf(o), width: Math.max(1, this.x(o.end) - this.x(o.start)),
          height: hgt, rx: 3, fill: "none", stroke: th.crit, "stroke-width": 2.2 }));
      }
    }
    if (this.focus != null && this.mode === "machine") {
      const route = this.ops.filter((o) => o.job === this.focus).sort((p, q) => p.rank - q.rank);
      let d = "";
      route.forEach((o, k) => {
        if (k === 0) return;
        const p = route[k - 1];
        d += `M${this.x(p.end)},${yOf(p) + hgt / 2} L${this.x(o.start)},${yOf(o) + hgt / 2} `;
      });
      this.overlay.append(s("path", { d, fill: "none", stroke: jobColor(this.focus), "stroke-width": 1.6, "stroke-dasharray": "3 3" }));
    }
    this.paintFocus();
  }

  paintFocus() {
    const crit = this.showCritical;
    for (const b of this.bars) {
      let op = 1;
      if (this.focus != null && b.o.job !== this.focus) op = 0.13;
      else if (crit && this.focus == null && !this.critical.has(b.o.i)) op = 0.3;
      b.g.setAttribute("opacity", op);
    }
  }

  setClock(t) { this.clock = t; this.paintClock(false); }

  paintClock(force) {
    const c = this.clock;
    const done = c == null;
    for (const b of this.bars) {
      const o = b.o;
      const st = done || o.end <= c ? "done" : o.start >= c ? "future" : "active";
      if (st !== b.state || st === "active" || force) {
        b.base.setAttribute("fill-opacity", st === "done" ? 1 : this.dark ? 0.16 : 0.14);
        b.prog.setAttribute("width", st === "active" ? Math.max(0, this.x(c) - b.x0) : 0);
        b.state = st;
      }
    }
    if (done) { this.cursor.setAttribute("visibility", "hidden"); return; }
    this.cursor.setAttribute("visibility", "visible");
    const x = this.x(c);
    this.cursorLine.setAttribute("x1", x);
    this.cursorLine.setAttribute("x2", x);
    this.cursorLabel.setAttribute("x", x);
    this.cursorLabel.textContent = Math.floor(c);
    const w = 12 + 7 * String(Math.floor(c)).length;
    this.cursorBg.setAttribute("x", x - w / 2);
    this.cursorBg.setAttribute("width", w);
    if (this.compact) this.cursorBg.setAttribute("visibility", "hidden");
  }

  // ------------------------------------------------------------- controls
  setMode(m) { this.mode = m; this.layout(); }
  setFocus(j) { this.focus = this.focus === j ? null : j; this.paintOverlay(); this.onFocus?.(this.focus); }
  toggleCritical() { this.showCritical = !this.showCritical; this.paintOverlay(); return this.showCritical; }
  zoom(f, tc) {
    const [a, b] = this.view;
    tc ??= (a + b) / 2;
    let na = tc - (tc - a) * f, nb = tc + (b - tc) * f;
    const span = Math.min(this.makespan, Math.max(nb - na, Math.max(4, this.makespan / 200)));
    na = Math.max(0, Math.min(tc - (tc - a) / (b - a) * span, this.makespan - span));
    this.view = [na, na + span];
    this.build();
  }
  resetZoom() { this.view = [0, this.makespan]; this.build(); }

  bindEvents() {
    const svg = this.svg;
    const pt = (e) => {
      const r = svg.getBoundingClientRect();
      return { x: (e.clientX - r.left) * (this.W / r.width), y: (e.clientY - r.top) * (this.H / r.height) };
    };
    let drag = null;
    svg.addEventListener("pointerdown", (e) => {
      if (this.compact) return;
      drag = { x: e.clientX, view: [...this.view], moved: false };
      svg.setPointerCapture(e.pointerId);
    });
    svg.addEventListener("pointermove", (e) => {
      if (drag) {
        const dx = e.clientX - drag.x;
        if (Math.abs(dx) > 3) drag.moved = true;
        if (drag.moved) {
          const r = svg.getBoundingClientRect();
          const dt = (-dx * (this.W / r.width) / this.plotW) * (drag.view[1] - drag.view[0]);
          const span = drag.view[1] - drag.view[0];
          const a = Math.max(0, Math.min(drag.view[0] + dt, this.makespan - span));
          this.view = [a, a + span];
          this.build();
          hideTip();
          return;
        }
      }
      const bar = e.target.closest?.(".bar");
      if (!bar) return hideTip();
      const o = this.ops[+bar.dataset.i];
      showTip(`<b>${t("Job")} ${o.job}</b> · ${t("operation")} ${o.rank}<br>${ttRows([[t("Machine"), `M${o.machine}`], [t("Start"), o.start],
        [t("End"), o.end], [t("Duration"), o.p]])}${this.critical.has(o.i) ? `<div style="margin-top:4px;color:#F2A93B">${t("On the critical path")}</div>` : ""}`,
        e.clientX, e.clientY);
    });
    svg.addEventListener("pointerleave", hideTip);
    svg.addEventListener("pointerup", (e) => {
      const wasDrag = drag?.moved;
      drag = null;
      if (wasDrag) return;
      const bar = e.target.closest?.(".bar");
      if (bar) return this.setFocus(this.ops[+bar.dataset.i].job);
      const p = pt(e);
      if (this.onSeek && p.x >= this.labelW) this.onSeek(Math.max(0, Math.min(this.makespan, this.t(p.x))));
    });
    svg.addEventListener("wheel", (e) => {
      if (this.compact || !(e.ctrlKey || e.metaKey)) return;
      e.preventDefault();
      this.zoom(e.deltaY > 0 ? 1.25 : 0.8, this.t(pt(e).x));
    }, { passive: false });
    svg.addEventListener("dblclick", () => !this.compact && this.resetZoom());
  }

  // ------------------------------------------------------------- export
  toSVGString() {
    const clone = this.svg.cloneNode(true);
    clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
    clone.setAttribute("width", this.W);
    clone.setAttribute("font-family", "Instrument Sans, Segoe UI, sans-serif");
    clone.querySelector("g[pointer-events=none]:last-child")?.setAttribute("visibility", "hidden");
    return new XMLSerializer().serializeToString(clone);
  }

  async toPNG(scale = 2) {
    const svgText = this.toSVGString();
    const img = new Image();
    img.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svgText);
    await img.decode();
    const c = document.createElement("canvas");
    c.width = this.W * scale;
    c.height = this.H * scale;
    const ctx = c.getContext("2d");
    ctx.fillStyle = "#FBFCFD";
    ctx.fillRect(0, 0, c.width, c.height);
    ctx.drawImage(img, 0, 0, c.width, c.height);
    return new Promise((res) => c.toBlob(res, "image/png"));
  }
}

// Operations on a longest chain that ends at the makespan, where each operation starts exactly when its
// job predecessor or its machine predecessor ends.
export function criticalPath(ops, makespan) {
  const byJob = new Map(), byMachine = new Map();
  for (const o of ops) {
    if (!byJob.has(o.job)) byJob.set(o.job, []);
    if (!byMachine.has(o.machine)) byMachine.set(o.machine, []);
    byJob.get(o.job).push(o);
    byMachine.get(o.machine).push(o);
  }
  byJob.forEach((l) => l.sort((a, b) => a.rank - b.rank));
  byMachine.forEach((l) => l.sort((a, b) => a.start - b.start));
  const prev = (list, o) => { const k = list.indexOf(o); return k > 0 ? list[k - 1] : null; };
  const crit = new Set();
  let cur = ops.find((o) => o.end === makespan);
  while (cur && !crit.has(cur.i)) {
    crit.add(cur.i);
    if (cur.start === 0) break;
    const pj = prev(byJob.get(cur.job), cur), pm = prev(byMachine.get(cur.machine), cur);
    cur = (pj && pj.end === cur.start) ? pj : (pm && pm.end === cur.start) ? pm : null;
  }
  return crit;
}

