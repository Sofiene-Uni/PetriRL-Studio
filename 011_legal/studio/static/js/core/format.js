// Number, time and axis formatting.
import { t } from "./i18n.js";

export const fmt = {
  int: (n) => (n == null ? "–" : Math.round(n).toLocaleString("en-US")),
  pct: (n) => (n == null ? "–" : `${n.toFixed(1)}%`),
  dur(s) {
    if (s == null) return "–";
    s = Math.round(s);
    if (s < 60) return `${s}s`;
    if (s < 3600) return `${Math.floor(s / 60)}m ${s % 60}s`;
    return `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m`;
  },
  ago(iso) {
    const d = (Date.now() - new Date(iso).getTime()) / 1000;
    if (d < 60) return t("just now");
    if (d < 3600) return `${Math.floor(d / 60)} min ago`;
    if (d < 86400) return `${Math.floor(d / 3600)} h ago`;
    return new Date(iso).toLocaleDateString();
  },
  // place in the compute queue: "Sorry, the server is busy. You are 2nd in line."
  inLine(n) {
    if (n === 1) return t("Sorry, the server is busy. You are next in line.");
    const suffix = n % 100 >= 11 && n % 100 <= 13 ? "th" : { 1: "st", 2: "nd", 3: "rd" }[n % 10] || "th";
    return t("Sorry, the server is busy. You are {nth} in line.", { nth: `${n}${suffix}`, n });
  },
};

export function niceStep(range, target = 8) {
  const raw = range / target;
  const p = 10 ** Math.floor(Math.log10(raw || 1));
  const n = raw / p;
  return (n < 1.5 ? 1 : n < 3.5 ? 2 : n < 7.5 ? 5 : 10) * p;
}
