// Training progress ring and learning curve (canvas).
import { h } from "../core/dom.js";
import { niceStep } from "../core/format.js";

export function ringSVG() {
  const el = h("div", { html: `<svg class="ring" viewBox="0 0 120 120"><circle cx="60" cy="60" r="50" fill="none" stroke="#E3E7EC" stroke-width="10"/>
    <circle class="arc" cx="60" cy="60" r="50" fill="none" stroke="#2F5BEA" stroke-width="10" stroke-linecap="round" transform="rotate(-90 60 60)" stroke-dasharray="0 400"/>
    <text x="60" y="66" text-anchor="middle" font-size="20" font-weight="600" fill="#1E2229">0%</text></svg>` });
  const arc = el.querySelector(".arc"), text = el.querySelector("text");
  return { el, set(p, st) {
    const c = 2 * Math.PI * 50;
    arc.setAttribute("stroke-dasharray", `${p * c} ${c}`);
    arc.setAttribute("stroke", st === "done" ? "#1E9E6A" : st === "failed" ? "#D2453B" : st === "cancelled" ? "#E09A2C" : "#2F5BEA");
    text.textContent = `${Math.round(p * 100)}%`;
  } };
}

export function drawChart(canvas, episodes, st) {
  const dpr = devicePixelRatio || 1;
  const W = canvas.clientWidth, H = canvas.clientHeight;
  if (!W || !H) return;
  canvas.width = W * dpr; canvas.height = H * dpr;
  const ctx = canvas.getContext("2d");
  ctx.scale(dpr, dpr);
  ctx.clearRect(0, 0, W, H);
  const pad = { l: 52, r: 14, t: 12, b: 28 };
  // reference line: mean optimum / best known of the training instances (computed lower bound if unknown)
  const lb = st.instances.reduce((a, i) => a + (i.reference?.value ?? i.lb), 0) / st.instances.length;
  const ys = episodes.map((e) => e[1]).concat(st.evals.map((e) => e[1]), [lb]);
  ctx.font = "12px Instrument Sans, sans-serif";
  if (!episodes.length && !st.evals.length) {
    ctx.fillStyle = "#7C8592";
    ctx.textAlign = "center";
    ctx.fillText("The first episodes appear after a few seconds", W / 2, H / 2);
    return;
  }
  const sorted = [...ys].sort((a, b) => a - b);
  const yMin = Math.min(lb, sorted[0]) * 0.97;
  const yMax = sorted[Math.floor(sorted.length * 0.98)] * 1.03;
  const xMax = Math.max(st.total_steps * (st.status === "running" ? Math.min(1, st.progress * 1.15 + 0.05) : st.progress), 1);
  const X = (v) => pad.l + (v / xMax) * (W - pad.l - pad.r);
  const Y = (v) => pad.t + (1 - (v - yMin) / (yMax - yMin)) * (H - pad.t - pad.b);

  ctx.strokeStyle = "#E3E7EC"; ctx.fillStyle = "#7C8592"; ctx.lineWidth = 1;
  const ys_ = niceStep(yMax - yMin, 5);
  ctx.textAlign = "right";
  for (let v = Math.ceil(yMin / ys_) * ys_; v <= yMax; v += ys_) {
    ctx.beginPath(); ctx.moveTo(pad.l, Y(v)); ctx.lineTo(W - pad.r, Y(v)); ctx.stroke();
    ctx.fillText(Math.round(v), pad.l - 8, Y(v) + 4);
  }
  ctx.textAlign = "center";
  const xs = niceStep(xMax, 6);
  for (let v = 0; v <= xMax; v += xs) ctx.fillText(v >= 1e6 ? `${v / 1e6}M` : v >= 1e3 ? `${v / 1e3}k` : v, X(v), H - 8);

  ctx.setLineDash([4, 3]); ctx.strokeStyle = "#1E2229";
  ctx.beginPath(); ctx.moveTo(pad.l, Y(lb)); ctx.lineTo(W - pad.r, Y(lb)); ctx.stroke(); ctx.setLineDash([]);

  ctx.fillStyle = "rgba(124,133,146,.35)";
  for (const [x, y] of episodes) { ctx.beginPath(); ctx.arc(X(x), Y(Math.min(y, yMax)), 1.8, 0, 7); ctx.fill(); }

  const win = Math.max(5, Math.floor(episodes.length / 40));
  ctx.strokeStyle = "#2F5BEA"; ctx.lineWidth = 2.2; ctx.beginPath();
  let sum = 0;
  episodes.forEach(([x, y], i) => {
    sum += y; if (i >= win) sum -= episodes[i - win][1];
    if (i >= win - 1) { const v = sum / win; i === win - 1 ? ctx.moveTo(X(x), Y(v)) : ctx.lineTo(X(x), Y(v)); }
  });
  ctx.stroke();

  ctx.strokeStyle = "#E09A2C"; ctx.fillStyle = "#E09A2C"; ctx.lineWidth = 2;
  ctx.beginPath();
  st.evals.forEach(([x, y], i) => (i ? ctx.lineTo(X(x), Y(y)) : ctx.moveTo(X(x), Y(y))));
  ctx.stroke();
  for (const [x, y] of st.evals) { ctx.beginPath(); ctx.arc(X(x), Y(y), 3, 0, 7); ctx.fill(); }
}
