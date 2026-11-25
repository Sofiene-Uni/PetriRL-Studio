// State shared by the views: the libraries and what the user selected (kept while navigating).
import { api } from "./api.js";

const saved = (() => { try { return localStorage.getItem("petrirl.env"); } catch { return null; } })();

export const state = {
  instances: [],
  agents: [],
  envs: [],                      // environments from /api/envs
  env: saved || "basic",         // the environment chosen on the home page (Train and Solve follow it)
  pickedInstances: new Set(),
  pickedAgents: new Set(),
  trainInstances: new Set(),
  lastResults: null,
};

export async function refreshLibrary() {
  [state.instances, state.agents, state.envs] = await Promise.all([api("/api/instances"), api("/api/agents"), api("/api/envs")]);
  if (!state.envs.some((e) => e.name === state.env)) state.env = state.envs[0]?.name || "basic";
  const ids = new Set(state.instances.map((i) => i.id));
  for (const set of [state.pickedInstances, state.trainInstances]) for (const id of set) if (!ids.has(id)) set.delete(id);
  const aids = new Set(state.agents.map((a) => a.id));
  for (const id of state.pickedAgents) if (!aids.has(id)) state.pickedAgents.delete(id);
}

export function setEnv(name) {
  state.env = name;
  try { localStorage.setItem("petrirl.env", name); } catch { /* private mode */ }
  document.dispatchEvent(new CustomEvent("envchange"));
}

export const envOf = (name) => state.envs.find((e) => e.name === name) || { name, title: name, options: {} };
