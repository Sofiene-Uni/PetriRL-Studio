// Light / dark theme of the simulation (Petri net replay, policy view, home replay). Saved in the browser.
// The CSS side (panel, inspector, transport) is the .sim / .sim.theme-light variables in css/views/run.css.
import { h } from "./dom.js";

export const SIM_THEMES = {
  dark: {
    arc: "#4A535F", arcFaint: "#39414B", place: "#262C34", placeStroke: "#8E98A5", flagStroke: "#6B7480",
    auto: "#6B7480", ctrl: "#2F5BEA", ctrlIdle: "#1E2229", timed: "#C9D0DA", fire: "#F2A93B",
    label: "#7E8894", text: "#E6EAF0", strong: "#FFFFFF", muted: "#98A2AF", track: "#3A424D",
    flagToken: "#C9D0DA", dotStroke: "#1E2229", masked: "#5A636F", cross: "#D2453B",
    node: "#6B7480", edge: "#4A535F", rowBand: "#262C34",
  },
  light: {
    arc: "#AEB6C1", arcFaint: "#CDD3DB", place: "#FFFFFF", placeStroke: "#7C8592", flagStroke: "#A2AAB5",
    auto: "#8A939F", ctrl: "#2F5BEA", ctrlIdle: "#FFFFFF", timed: "#4A525E", fire: "#E09A2C",
    label: "#7C8592", text: "#1E2229", strong: "#1E2229", muted: "#66707C", track: "#E3E7EC",
    flagToken: "#4A525E", dotStroke: "#FFFFFF", masked: "#A9B1BC", cross: "#D2453B",
    node: "#A2AAB5", edge: "#C9D0D8", rowBand: "#F4F6F8",
  },
};

const KEY = "petrirl.simTheme";

export function simThemeName() {
  try { return localStorage.getItem(KEY) === "light" ? "light" : "dark"; } catch { return "dark"; }
}

export const simPalette = () => SIM_THEMES[simThemeName()];

export function setSimTheme(name) {
  try { localStorage.setItem(KEY, name); } catch { /* private mode */ }
  document.dispatchEvent(new CustomEvent("simthemechange", { detail: name }));
}

// apply the theme class to a .sim container, now and on every change; returns a function to stop following
export function followSimTheme(el, onChange) {
  const apply = () => { el.classList.toggle("theme-light", simThemeName() === "light"); onChange?.(simThemeName()); };
  el.classList.add("sim");
  apply();
  document.addEventListener("simthemechange", apply);
  return () => document.removeEventListener("simthemechange", apply);
}

export function themeSwitch() {
  const box = h("div", { class: "theme-switch", role: "group", "aria-label": "Simulation theme" });
  const render = () => box.replaceChildren(...[["dark", "Dark"], ["light", "Light"]].map(([k, label]) =>
    h("button", { type: "button", class: simThemeName() === k ? "on" : "", "aria-pressed": simThemeName() === k,
      onclick: () => { setSimTheme(k); render(); } }, label)));
  render();
  document.addEventListener("simthemechange", render);
  return box;
}
