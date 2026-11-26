// One color per job, shared by tokens, Gantt bars and decision bars.

const PALETTE = ["#2F5BEA", "#E8743B", "#19A979", "#ED4A7B", "#945ECF", "#13A4B4", "#C9A227", "#6F8B2B",
  "#D44D3A", "#3D7FB8", "#B05FA2", "#2E9E8F", "#E09A2C", "#5A6ACF", "#A2563A", "#4FA35A", "#CF5C8E",
  "#2B8CBE", "#8C6D3F", "#6C4FB6"];

export function jobColor(j) {
  if (!j) return "#8A939F";
  if (j <= PALETTE.length) return PALETTE[j - 1];
  const h = (j * 137.508) % 360;
  return `hsl(${h.toFixed(0)} 62% ${48 + (j % 3) * 6}%)`;
}
