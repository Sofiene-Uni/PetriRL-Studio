// Petri net player: layered layout of the scheduling net and exact replay of the recorded firings.
import { jobColor } from "../core/colors.js";
import { s } from "../core/dom.js";
import { simPalette } from "../core/sim-theme.js";
import { hideTip, showTip, ttRows } from "../core/ui.js";
import { t } from "../core/i18n.js";

const ROW_LABELS = () => ({
  0: t("Job return"), 1: t("Route by job"), 2: t("Job queues"), 3: t("Agent choice"), 4: t("Dispatch"),
  5: t("Route by machine"), 6: t("Machine queues"), 7: t("Start"), 8: t("Processing"), 9: t("Finish"), 10: t("Done"),
});
const ROLE_ROW = {
  job_sorting: 0, job_sort: 1, job: 2, job_idle: 2, job_select: 3, standby: 3, machine_sorting: 4, machine_sort: 5,
  machine_buffer: 6, machine_idle: 8, machine_start: 7, machine_processing: 8, machine_finish: 9, delivery: 10,
};
const RADIUS = { job_sorting: 14, job: 15, job_idle: 7, machine_sorting: 14, machine_buffer: 15, machine_idle: 7,
  machine_processing: 16, delivery: 15 };
export const SPEEDS = [0.25, 0.5, 1, 2, 4, 8, 16, 32, 64];


export class PetriPlayer {
  constructor(container, run, { compact = false, onClock, onDecision, onState } = {}) {
    this.el = container;
    this.run = run;
    this.compact = compact;
    this.onClock = onClock || (() => {});
    this.onDecision = onDecision || (() => {});
    this.onState = onState || (() => {});
    this.events = run.events;
    this.decisions = run.decisions;
    this.tokens = run.tokens;
    this.makespan = Math.max(1, run.makespan);
    this.nodes = new Map(run.net.nodes.map((n) => [n.id, n]));
    this.speed = 1;
    this.playing = false;
    this.C = simPalette();
    this.buildWaves();
    this.layoutNet();
    this.draw();
    this.toEnd();
    this.onTheme = () => this.retheme();
    document.addEventListener("simthemechange", this.onTheme);
  }

  // ------------------------------------------------------------- replay model
  buildWaves() {
    // A wave = consecutive firings at the same clock that touch different places; they are animated together.
    this.waves = [];
    let cur = null, touched = null;
    this.events.forEach((ev, i) => {
      const places = [...ev[2].map((p) => p[0]), ...ev[4]];
      const clash = !cur || ev[0] !== this.events[cur.start][0] || places.some((p) => touched.has(p));
      if (clash) {
        cur = { start: i, end: i + 1, clock: ev[0] };
        touched = new Set();
        this.waves.push(cur);
      } else cur.end = i + 1;
      places.forEach((p) => touched.add(p));
    });
    this.decisionAt = new Map(this.decisions.map((d, i) => [d.e, i]));
  }

  resetMarking() {
    this.marking = new Map();
    this.entry = new Map();
    for (const [p, toks] of Object.entries(this.run.initial)) this.marking.set(p, [...toks]);
    this.k = 0;            // events applied
    this.w = 0;            // waves applied
    this.clock = 0;
  }

  applyEvent(ev, render = true) {
    const [clock, , pops, tok, children] = ev;
    for (const [p, t] of pops) {
      const list = this.marking.get(p) || [];
      const at = list.indexOf(t);
      if (at >= 0) list.splice(at, 1);
      if (render) this.paintPlace(p);
    }
    for (const c of children) {
      if (!this.marking.has(c)) this.marking.set(c, []);
      this.marking.get(c).push(tok);
      this.entry.set(`${c}|${tok}`, clock);
      if (render) this.paintPlace(c);
    }
    this.clock = clock;
  }

  seekEvent(k, clock = null) {
    this.pause();
    this.resetMarking();
    k = Math.max(0, Math.min(this.events.length, k));
    for (let i = 0; i < k; i++) this.applyEvent(this.events[i], false);
    this.k = k;
    this.w = this.waves.findIndex((w) => w.start >= k);
    if (this.w < 0) this.w = this.waves.length;
    if (clock != null) this.clock = clock;
    this.paintAll();
    this.emit();
  }

  seekTime(t) {
    let k = 0;
    while (k < this.events.length && this.events[k][0] <= t) k++;
    // stay on a wave boundary
    const w = this.waves.find((wv) => wv.start <= k && k < wv.end);
    if (w) k = w.end;
    this.seekEvent(k, t);
  }

  toStart() { this.seekEvent(0, 0); }
  toEnd() { this.seekEvent(this.events.length, this.makespan); }
  atEnd() { return this.k >= this.events.length; }

  stepWave(dir) {
    this.pause();
    if (dir > 0 && this.w < this.waves.length) {
      const wave = this.waves[this.w];
      this.showWait(wave, 400);
      for (let i = wave.start; i < wave.end; i++) this.applyEvent(this.events[i]);
      this.k = wave.end;
      this.w++;
      this.flashWave(wave);
      this.emit();
    } else if (dir < 0 && this.w > 0) {
      const target = this.waves[this.w - 1];
      this.seekEvent(target.start, target.clock);
    }
  }

  emit() {
    this.paintProcessing();
    this.paintEnabled();
    this.onClock(this.clock);
    const di = this.currentDecision();
    this.onDecision(di, di >= 0 ? this.decisions[di] : null);
    this.onState({ playing: this.playing, k: this.k, n: this.events.length, clock: this.clock });
  }

  currentDecision() {
    // last decision already taken (its firing is applied)
    let lo = -1, hi = this.decisions.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (this.decisions[mid].e < this.k) lo = mid; else hi = mid - 1;
    }
    return lo;
  }

  // ------------------------------------------------------------- playback
  setSpeed(v) { this.speed = v; }

  autoSpeed(targetSeconds = 45) {
    const at1 = 16 + this.waves.length * 0.5;
    const want = at1 / targetSeconds;
    this.speed = SPEEDS.find((v) => v >= want) || SPEEDS[SPEEDS.length - 1];
    return this.speed;
  }

  play() {
    if (this.playing) return;
    if (this.atEnd()) this.seekEvent(0, 0);
    this.playing = true;
    this.phase = null;
    this.last = performance.now();
    this.raf = requestAnimationFrame((t) => this.tick(t));
    this.emit();
  }

  pause() {
    if (!this.playing) return;
    this.playing = false;
    cancelAnimationFrame(this.raf);
    this.clearDots();
    if (this.phase?.kind === "fire") {           // finish the wave instantly to stay consistent
      const wave = this.phase.wave;
      for (let i = wave.start; i < wave.end; i++) if (i >= this.k) this.applyEvent(this.events[i]);
      this.k = wave.end;
      this.w++;
    }
    this.phase = null;
    this.emit();
  }

  toggle() { this.playing ? this.pause() : this.play(); }

  tick(now) {
    if (!this.playing) return;
    const dt = Math.min(100, now - this.last);
    this.last = now;
    const msUnit = (16000 / this.makespan) / this.speed;
    const msFire = 480 / this.speed;

    if (!this.phase) {
      if (this.w >= this.waves.length) {
        // let the clock reach the makespan, then stop
        if (this.clock < this.makespan) this.phase = { kind: "time", target: this.makespan };
        else { this.playing = false; this.emit(); return; }
      } else {
        const wave = this.waves[this.w];
        if (wave.clock > this.clock + 1e-9) {
          this.phase = { kind: "time", target: wave.clock };
          this.showWait(wave, (wave.clock - this.clock) * msUnit);
        } else this.startWave(wave, msFire);
      }
    }

    const ph = this.phase;
    if (ph?.kind === "time") {
      this.clock = Math.min(ph.target, this.clock + dt / msUnit);
      this.paintProcessing();
      this.onClock(this.clock);
      if (this.clock >= ph.target - 1e-9) { this.clock = ph.target; this.phase = null; }
    } else if (ph?.kind === "fire") {
      ph.t += dt;
      const f = Math.min(1, ph.t / ph.dur);
      this.moveDots(f);
      if (f >= 1) this.endWave();
    }
    this.raf = requestAnimationFrame((t) => this.tick(t));
  }

  startWave(wave, msFire) {
    const di = this.decisionAt.get(wave.start);
    if (msFire < 30) {                          // too fast to animate: apply directly
      for (let i = wave.start; i < wave.end; i++) this.applyEvent(this.events[i]);
      this.k = wave.end;
      this.w++;
      this.emit();
      return;
    }
    // tokens leave their places now, arrive at the end
    const dots = [];
    for (let i = wave.start; i < wave.end; i++) {
      const [, tr, pops, tok, children] = this.events[i];
      for (const [p, t] of pops) {
        const list = this.marking.get(p) || [];
        const at = list.indexOf(t);
        if (at >= 0) list.splice(at, 1);
        this.paintPlace(p);
        dots.push(this.makeDot(`${p}>${tr}`, this.dotColor(p, t), 0, 0.5));
      }
      for (const c of children) dots.push(this.makeDot(`${tr}>${c}`, this.dotColor(c, tok), 0.5, 1));
      this.flash(tr, msFire);
    }
    this.phase = { kind: "fire", wave, t: 0, dur: msFire, dots };
    if (di != null) this.onDecision(di, this.decisions[di]);
  }

  endWave() {
    const wave = this.phase.wave;
    this.clearDots();
    for (let i = wave.start; i < wave.end; i++) {
      const [clock, , , tok, children] = this.events[i];
      for (const c of children) {
        if (!this.marking.has(c)) this.marking.set(c, []);
        this.marking.get(c).push(tok);
        this.entry.set(`${c}|${tok}`, clock);
        this.paintPlace(c);
      }
      this.clock = clock;
    }
    this.k = wave.end;
    this.w++;
    this.phase = null;
    this.emit();
  }

  dotColor(place, tok) {
    const n = this.nodes.get(place);
    if (n?.type === "f") return this.C.flagToken;
    return jobColor(this.tokens[tok]?.[0]);
  }

  makeDot(arcKey, color, from, to) {
    const path = this.arcPaths.get(arcKey);
    const dot = s("circle", { r: this.compact ? 3.6 : 4.6, fill: color, stroke: this.C.dotStroke, "stroke-width": 1.2 });
    this.dotsG.append(dot);
    return { dot, path, len: path ? path.getTotalLength() : 0, from, to };
  }

  moveDots(f) {
    for (const d of this.phase.dots) {
      const local = (f - d.from) / (d.to - d.from);
      if (local < 0 || local > 1 || !d.path) { d.dot.setAttribute("visibility", "hidden"); continue; }
      const e = local < 0.5 ? 2 * local * local : 1 - (-2 * local + 2) ** 2 / 2;     // ease in-out
      const p = d.path.getPointAtLength(e * d.len);
      d.dot.setAttribute("visibility", "visible");
      d.dot.setAttribute("cx", p.x);
      d.dot.setAttribute("cy", p.y);
    }
  }

  clearDots() { this.dotsG?.replaceChildren(); }

  flash(tid, ms) {
    const el = this.transEls.get(tid);
    if (!el) return;
    el.style.fill = this.C.fire;
    el.style.stroke = this.C.fire;
    clearTimeout(el._t);
    el._t = setTimeout(() => this.paintTransition(tid), Math.max(120, ms));
  }

  // a standby decision fires no transition of its own: show it while the clock runs to the next finish
  showWait(wave, ms) {
    const di = this.decisionAt.get(wave.start);
    if (di == null || !this.decisions[di].wait) return;
    if (this.standbyId) this.flash(this.standbyId, ms);
    this.onDecision(di, this.decisions[di]);
  }

  flashWave(wave) {
    for (let i = wave.start; i < wave.end; i++) this.flash(this.events[i][1], 260);
  }

  // ------------------------------------------------------------- layout
  layoutNet() {
    const { n_jobs: nj, n_machines: nm } = this.run.net;
    const cols = Math.max(nj, nm);
    const gap = this.compact ? 58 : 72;
    this.labelW = this.compact ? 16 : 128;
    this.rowGap = this.compact ? 30 : 62;
    const W = cols * gap;
    this.netW = W;
    // the wait action gets its own column left of the jobs, set apart by a dashed divider
    const hasStandby = this.run.net.nodes.some((n) => n.role === "standby");
    const waitW = hasStandby ? (this.compact ? 46 : 70) : 0;
    const x0 = this.labelW + waitW;
    this.waitX = this.labelW + waitW * 0.42;
    this.waitDivX = x0 - waitW * 0.08;
    const xj = (i) => x0 + (i + 0.5) * (W / nj);
    const xm = (i) => x0 + (i + 0.5) * (W / nm);
    const cx = x0 + W / 2;
    this.gutterX = x0 + W + 34;
    const y = (r) => 34 + r * this.rowGap;
    this.yRow = y;
    const pos = new Map();
    for (const n of this.run.net.nodes) {
      const r = ROLE_ROW[n.role];
      let x;
      switch (n.role) {
        case "job_sorting": case "machine_sorting": x = cx; break;
        case "job_sort": case "job_idle": x = xj(n.idx) + 24; break;
        case "job": case "job_select": x = xj(n.idx); break;
        case "machine_idle": x = xm(n.idx) + 34; break;      // next to its machine (processing place)
        case "standby": x = this.waitX; break;
        default: x = xm(n.idx);
      }
      pos.set(n.id, { x, y: y(r) });
    }
    this.pos = pos;
    this.standbyId = this.run.net.nodes.find((n) => n.role === "standby")?.id ?? null;
    this.W = this.gutterX + 30;
    this.H = y(10) + (this.compact ? 22 : 46);
  }

  arcPath(a, b) {
    const na = this.nodes.get(a), nb = this.nodes.get(b);
    const pa = this.pos.get(a), pb = this.pos.get(b);
    const ra = na.kind === "place" ? RADIUS[na.role] * (this.compact ? 0.8 : 1) : 4;
    const rb = nb.kind === "place" ? RADIUS[nb.role] * (this.compact ? 0.8 : 1) : 4;
    if (na.role === "machine_finish" && nb.role === "job_sorting") {        // feedback bus on the right
      const busY = pa.y + this.rowGap * 0.5, top = pb.y, g = this.gutterX;
      return `M${pa.x},${pa.y + 4} L${pa.x},${busY - 6} Q${pa.x},${busY} ${pa.x + 6},${busY} L${g - 8},${busY} ` +
        `Q${g},${busY} ${g},${busY - 8} L${g},${top + 8} Q${g},${top} ${g - 8},${top} L${pb.x + rb},${top}`;
    }
    // flag places beside their column: smooth splines from the side of a transition to the flag and back
    const halfW = (n) => (n.type === "c" ? 15 : 12) * (this.compact ? 0.8 : 1);
    if (nb.role === "machine_idle" || nb.role === "job_idle") {           // transition -> flag
      if (Math.abs(pa.x - pb.x) < 1) return this.straight(pa, pb, ra, rb);  // job_sort sits right above its flag
      const sx = pa.x + halfW(na), down = pb.y > pa.y ? 1 : -1;
      const ey = pb.y - down * rb;
      return `M${sx},${pa.y} C${pb.x},${pa.y} ${pb.x},${ey - down * 14} ${pb.x},${ey}`;
    }
    if (na.role === "machine_idle" || na.role === "job_idle") {           // flag -> transition
      const ex = pb.x + halfW(nb), down = pb.y > pa.y ? 1 : -1;
      const sy = pa.y + down * ra;
      return `M${pa.x},${sy} C${pa.x},${sy + down * 14} ${pa.x},${pb.y} ${ex},${pb.y}`;
    }
    return this.straight(pa, pb, ra, rb);
  }

  straight(pa, pb, ra, rb) {
    const dx = pb.x - pa.x, dy = pb.y - pa.y, L = Math.hypot(dx, dy) || 1;
    return `M${pa.x + (dx / L) * ra},${pa.y + (dy / L) * ra} L${pb.x - (dx / L) * rb},${pb.y - (dy / L) * rb}`;
  }

  // ------------------------------------------------------------- drawing
  draw() {
    const svg = s("svg", { viewBox: `0 0 ${this.W} ${this.H}`, preserveAspectRatio: "xMidYMid meet" });
    this.svg = svg;
    this.vb = { x: 0, y: 0, w: this.W, h: this.H };
    const defs = s("defs",
      s("marker", { id: "arw", viewBox: "0 0 10 10", refX: 9, refY: 5, markerWidth: 5, markerHeight: 5, orient: "auto-start-reverse" },
        s("path", { d: "M0,0 L10,5 L0,10 z", fill: this.C.arc })));
    svg.append(defs);

    if (!this.compact) {
      const lab = s("g");
      for (const [r, text] of Object.entries(ROW_LABELS())) {
        lab.append(s("text", { x: 14, y: this.yRow(+r) + 4, "font-size": 12, fill: this.C.label }, text));
      }
      svg.append(lab);
    }

    const arcsG = s("g", { fill: "none" });
    this.arcPaths = new Map();
    for (const [a, b] of this.run.net.arcs) {
      const na = this.nodes.get(a), nb = this.nodes.get(b);
      const feedback = na.role === "machine_finish" && nb.role === "job_sorting";
      const fan = na.role === "job_sorting" || nb.role === "machine_sorting" || na.role === "machine_sorting";
      const p = s("path", { d: this.arcPath(a, b), stroke: feedback ? this.C.arcFaint : this.C.arc,
        "stroke-width": feedback || fan ? 1 : 1.3, "marker-end": feedback || this.compact ? null : "url(#arw)" });
      arcsG.append(p);
      this.arcPaths.set(`${a}>${b}`, p);
    }
    svg.append(arcsG);

    // nodes
    const nodesG = s("g");
    this.placeEls = new Map();
    this.transEls = new Map();
    this.ctlDecor = new Map();
    this.crossLayer = [];
    const k = this.compact ? 0.8 : 1;
    for (const n of this.run.net.nodes) {
      const { x, y } = this.pos.get(n.id);
      if (n.kind === "place") {
        const r = RADIUS[n.role] * k;
        const g = s("g", { "data-id": n.id, class: "node" });
        const flag = n.type === "f";
        g.append(s("circle", { cx: x, cy: y, r, fill: this.C.place, stroke: flag ? this.C.flagStroke : this.C.placeStroke,
          "stroke-width": n.role === "delivery" ? 2.4 : 1.5, "stroke-dasharray": flag ? "2 2" : null }));
        if (n.role === "machine_processing") {
          const ring = s("circle", { cx: x, cy: y, r: r + 3.5, fill: "none", stroke: this.C.fire, "stroke-width": 2.5,
            transform: `rotate(-90 ${x} ${y})`, "stroke-dasharray": `0 ${2 * Math.PI * (r + 3.5)}`, "stroke-linecap": "round" });
          g.append(ring);
          g._ring = ring;
          g._circ = 2 * Math.PI * (r + 3.5);
        }
        const toks = s("g", { "pointer-events": "none" });
        g.append(toks);
        g._toks = toks;
        g._x = x; g._y = y; g._r = r;
        nodesG.append(g);
        this.placeEls.set(n.id, g);
      } else {
        const ctrl = n.type === "c";
        const w = (ctrl ? 30 : 24) * k, hgt = (ctrl ? 10 : 7) * k;
        if (ctrl) {      // halo (enabled) and cross (masked) drawn around agent transitions
          const halo = s("rect", { x: x - w / 2, y: y - hgt / 2, width: w, height: hgt, rx: 3, class: "ctl-halo",
            fill: "none", stroke: this.C.ctrl, "stroke-width": 2 });
          const c = 3.4 * k;
          const cross = s("path", { d: `M${x - c},${y - c} L${x + c},${y + c} M${x + c},${y - c} L${x - c},${y + c}`,
            class: "ctl-cross", stroke: this.C.cross, "stroke-width": 1.8, "stroke-linecap": "round", "pointer-events": "none" });
          nodesG.append(halo);
          this.ctlDecor.set(n.id, { halo, cross });
          this.crossLayer.push(cross);
        }
        const rect = s("rect", { x: x - w / 2, y: y - hgt / 2, width: w, height: hgt, rx: 2, "data-id": n.id,
          class: ctrl ? "node ctl" : "node", "stroke-width": ctrl ? 1.6 : 1 });
        nodesG.append(rect);
        this.transEls.set(n.id, rect);
        this.paintTransition(n.id);
      }
    }
    svg.append(nodesG);
    svg.append(s("g", {}, this.crossLayer));

    if (this.standbyId) {            // divider and label that set the wait action apart from the jobs
      const yw = this.pos.get(this.standbyId).y, d = this.rowGap * 0.75;
      svg.insertBefore(s("line", { x1: this.waitDivX, x2: this.waitDivX, y1: yw - d, y2: yw + d, stroke: this.C.label,
        "stroke-width": 1, "stroke-dasharray": "3 3", opacity: 0.6 }), nodesG);
      svg.append(s("text", { x: this.waitX, y: yw + (this.compact ? 15 : 20), "text-anchor": "middle",
        "font-size": this.compact ? 9.5 : 11, "font-weight": 600, fill: this.C.label }, "wait"));
    }
    if (!this.compact) {
      const cols = s("g");
      for (const n of this.run.net.nodes) {
        const { x, y } = this.pos.get(n.id);
        if (n.role === "job") cols.append(s("text", { x, y: y - 22, "text-anchor": "middle", "font-size": 11, "font-weight": 600, fill: jobColor(n.color) }, `J${n.color}`));
        if (n.role === "delivery") cols.append(s("text", { x, y: y + 31, "text-anchor": "middle", "font-size": 11, fill: this.C.label }, `M${n.color ?? n.idx + 1}`));
      }
      svg.append(cols);
    }

    this.dotsG = s("g", { "pointer-events": "none" });
    svg.append(this.dotsG);
    this.el.replaceChildren(svg);
    if (!this.compact) this.bindInteractions();
  }

  paintTransition(tid) {
    const el = this.transEls.get(tid);
    const n = this.nodes.get(tid);
    if (!el) return;
    if (n.type === "c") {
      // enabled: blue with a pulsing halo; masked (not enabled by the guard function): dimmed, dashed, crossed;
      // between decisions: neutral
      const st = this.enabled?.has(tid) ? "on" : this.masked?.has(tid) ? "masked" : "idle";
      el.style.fill = st === "on" ? this.C.ctrl : this.C.ctrlIdle;
      el.style.stroke = st === "masked" ? this.C.masked : this.C.ctrl;
      el.style.opacity = st === "masked" ? 0.55 : st === "idle" ? 0.75 : 1;
      el.style.strokeDasharray = st === "masked" ? "3 2" : "";
      const deco = this.ctlDecor.get(tid);
      if (deco) {
        deco.halo.classList.toggle("pulse", st === "on");
        deco.cross.classList.toggle("show", st === "masked");
      }
    } else {
      const color = n.type === "t" ? this.C.timed : this.C.auto;
      el.style.fill = color;
      el.style.stroke = color;
    }
  }

  paintEnabled() {
    // controllable transitions enabled / masked at the decision the agent is about to take: shown from the
    // moment that decision is due at the current clock (the automatic firings before it do not change the mask)
    let di = this.decisionAt.get(this.k);
    if (di == null) {
      const next = this.decisions.findIndex((d) => d.e >= this.k);
      if (next >= 0 && this.decisions[next].clock === this.clock) di = next;
    }
    this.enabled = new Set();
    this.masked = new Set();
    if (di != null) {
      const jobs = new Set(this.decisions[di].enabled);
      for (const n of this.run.net.nodes) {
        if (n.role === "job_select") (jobs.has(n.color) ? this.enabled : this.masked).add(n.id);
      }
      if (this.standbyId) (this.decisions[di].wait_enabled ? this.enabled : this.masked).add(this.standbyId);
    }
    for (const [tid, n] of this.nodes) if (n.type === "c") this.paintTransition(tid);
  }

  paintAll() { for (const id of this.placeEls.keys()) this.paintPlace(id); }

  paintPlace(pid) {
    const g = this.placeEls.get(pid);
    if (!g) return;
    const n = this.nodes.get(pid);
    const toks = this.marking.get(pid) || [];
    const box = g._toks;
    box.replaceChildren();
    const { _x: x, _y: y, _r: r } = g;
    if (!toks.length) return;
    if (n.type === "f") {
      box.append(s("circle", { cx: x, cy: y, r: r * 0.45, fill: this.C.flagToken }));
      return;
    }
    const dr = this.compact ? 2.6 : 3.6;
    if (toks.length <= 4) {
      const spots = [[[0, 0]], [[-1, 0], [1, 0]], [[-1, 0.9], [1, 0.9], [0, -0.9]], [[-1, -1], [1, -1], [-1, 1], [1, 1]]][toks.length - 1];
      toks.forEach((t, i) => {
        const [ox, oy] = spots[i];
        box.append(s("circle", { cx: x + ox * dr * 1.35, cy: y + oy * dr * 1.35, r: dr, fill: jobColor(this.tokens[t]?.[0]) }));
      });
    } else {
      box.append(s("circle", { cx: x, cy: y, r: r - 2.5, fill: "none", stroke: jobColor(this.tokens[toks[0]]?.[0]), "stroke-width": 3 }));
      box.append(s("text", { x, y: y + 4, "text-anchor": "middle", "font-size": this.compact ? 9 : 11.5, "font-weight": 700,
        fill: this.C.text, "font-family": "JetBrains Mono, monospace" }, toks.length));
    }
  }

  paintProcessing() {
    for (const [pid, g] of this.placeEls) {
      if (!g._ring) continue;
      const tok = (this.marking.get(pid) || [])[0];
      let f = 0;
      if (tok) {
        const start = this.entry.get(`${pid}|${tok}`) ?? this.findEntry(pid, tok);
        const p = this.tokens[tok][3];
        f = Math.max(0, Math.min(1, (this.clock - start) / p));
      }
      g._ring.setAttribute("stroke-dasharray", `${f * g._circ} ${g._circ}`);
      g._ring.setAttribute("visibility", f > 0 ? "visible" : "hidden");
    }
  }

  findEntry(pid, tok) {
    for (let i = this.k - 1; i >= 0; i--) {
      const ev = this.events[i];
      if (ev[3] === tok && ev[4].includes(pid)) { this.entry.set(`${pid}|${tok}`, ev[0]); return ev[0]; }
    }
    return this.clock;
  }

  // ------------------------------------------------------------- hover, pan, zoom
  bindInteractions() {
    const svg = this.svg;
    svg.addEventListener("pointermove", (e) => {
      if (this.drag) return;
      const node = e.target.closest?.(".node");
      if (!node) return hideTip();
      const n = this.nodes.get(node.dataset.id);
      showTip(this.describe(n), e.clientX, e.clientY);
    });
    svg.addEventListener("pointerleave", hideTip);
    svg.addEventListener("pointerdown", (e) => {
      this.drag = { x: e.clientX, y: e.clientY, vb: { ...this.vb } };
      this.el.classList.add("dragging");
      svg.setPointerCapture(e.pointerId);
    });
    svg.addEventListener("pointermove", (e) => {
      if (!this.drag) return;
      const r = svg.getBoundingClientRect();
      const sc = Math.max(this.vb.w / r.width, this.vb.h / r.height);
      this.vb.x = this.drag.vb.x - (e.clientX - this.drag.x) * sc;
      this.vb.y = this.drag.vb.y - (e.clientY - this.drag.y) * sc;
      this.applyVB();
    });
    const end = () => { this.drag = null; this.el.classList.remove("dragging"); };
    svg.addEventListener("pointerup", end);
    svg.addEventListener("pointercancel", end);
    svg.addEventListener("wheel", (e) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      e.preventDefault();
      this.zoom(e.deltaY > 0 ? 1.2 : 1 / 1.2);
    }, { passive: false });
  }

  zoom(f) {
    const cx = this.vb.x + this.vb.w / 2, cy = this.vb.y + this.vb.h / 2;
    this.vb.w = Math.min(this.W * 1.5, Math.max(this.W / 12, this.vb.w * f));
    this.vb.h = this.vb.w * (this.H / this.W);
    this.vb.x = cx - this.vb.w / 2;
    this.vb.y = cy - this.vb.h / 2;
    this.applyVB();
  }
  fit() { this.vb = { x: 0, y: 0, w: this.W, h: this.H }; this.applyVB(); }
  applyVB() { this.svg.setAttribute("viewBox", `${this.vb.x} ${this.vb.y} ${this.vb.w} ${this.vb.h}`); }

  describe(n) {
    const names = {
      job_sorting: t("Job return (sorting place)"), job_sort: t("Route token back to its job"), job: t("Job queue"),
      job_idle: t("Job is free (flag)"), job_select: t("Agent action: release the next operation"), machine_sorting: t("Dispatch (sorting place)"),
      machine_sort: t("Route to the machine queue"), machine_buffer: t("Machine queue"), machine_idle: t("Machine idle (flag)"),
      machine_start: t("Start operation"), machine_processing: t("Processing"), machine_finish: t("Finish (timed)"),
      delivery: t("Finished operations"), standby: t("Agent action: wait until the next operation finishes"),
    };
    const who = n.role.startsWith("job") && n.color ? ` · J${n.color}` : n.role.startsWith("machine") || n.role === "delivery"
      ? (n.role === "machine_sorting" ? "" : ` · M${n.color ?? n.idx + 1}`) : "";
    let html = `<b>${names[n.role] || n.role}${who}</b>`;
    if (n.kind === "place") {
      const toks = this.marking.get(n.id) || [];
      if (n.type === "f") html += `<div>${toks.length ? "free" : "busy"}</div>`;
      else {
        html += `<div style="color:#98A2AF">${toks.length} token${toks.length === 1 ? "" : "s"}</div>`;
        html += ttRows(toks.slice(0, 6).map((t) => {
          const [j, m, rank, p] = this.tokens[t];
          return [`J${j} op ${rank}`, `M${m} · ${p}`];
        }));
        if (toks.length > 6) html += `<div style="color:#98A2AF">+${toks.length - 6} more</div>`;
      }
    } else if (n.type === "c") {
      html += `<div style="color:#98A2AF">${this.enabled?.has(n.id) ? t("enabled at this decision")
        : this.masked?.has(n.id) ? "masked: the guard function does not enable it now" : t("no decision pending")}</div>`;
    }
    return html;
  }

  // redraw with the current light / dark palette, keeping the replay position and the zoom
  retheme() {
    this.C = simPalette();
    const vb = this.vb ? { ...this.vb } : null;
    this.clearDots();
    this.draw();
    if (vb) { this.vb = vb; this.applyVB(); }
    this.paintAll();
    this.paintEnabled();
    this.paintProcessing();
  }

  destroy() {
    this.pause();
    document.removeEventListener("simthemechange", this.onTheme);
    this.el.replaceChildren();
  }
}
