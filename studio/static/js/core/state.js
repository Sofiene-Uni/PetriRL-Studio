// State shared by the views: the libraries and what the user selected (kept while navigating).
import { api } from "./api.js";

export const state = {
  instances: [],
  agents: [],
  envs: [],                      // environments from /api/envs
  env: "basic",                  // the environment chosen on the home page (Train and Solve follow it)
  pickedInstances: new Set(),
  pickedAgents: new Set(),
  metaParams: {},            // settings per metaheuristic id, kept while the app is open
  trainInstances: new Set(),
  lastResults: null,
  public: document.body.dataset.public === "1",   // public demo: no agent upload, nothing deleted or changed
};

export async function refreshLibrary() {
  [state.instances, state.agents, state.envs] = await Promise.all([api("/api/instances"), api("/api/agents"), api("/api/envs")]);
  if (!state.envs.some((e) => e.name === state.env)) state.env = state.envs[0]?.name || "basic";
  const ids = new Set(state.instances.map((i) => i.id));
  for (const set of [state.pickedInstances, state.trainInstances]) for (const id of set) if (!ids.has(id)) set.delete(id);
  const aids = new Set(state.agents.map((a) => a.id));
  for (const id of state.pickedAgents) if (!aids.has(id)) state.pickedAgents.delete(id);
}

// first load of the library, shared by the router and the home page
let firstLoad = null;
export const ensureLibrary = () => (firstLoad ??= refreshLibrary());

export function setEnv(name) {
  state.env = name;
  document.dispatchEvent(new CustomEvent("envchange"));
}

export const envOf = (name) => state.envs.find((e) => e.name === name) || { name, title: name, options: {} };
