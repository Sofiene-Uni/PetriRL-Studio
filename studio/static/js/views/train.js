// Train view: instances of one size, training settings, live dashboard (progress, learning curve, log).
import { dropZone } from "../components/dropzone.js";
import { randomForm, uploadInstances } from "../components/instance-actions.js";
import { instancePicker } from "../components/pickers.js";
import { seg } from "../components/segmented.js";
import { drawChart, ringSVG } from "../components/learning-chart.js";
import { api } from "../core/api.js";
import { h } from "../core/dom.js";
import { fmt } from "../core/format.js";
import { envOf, refreshLibrary, setEnv, state } from "../core/state.js";
import { toast } from "../core/ui.js";

const STEP_PRESETS = [[50_000, "50k, a quick look"], [200_000, "200k"], [500_000, "500k"], [1_000_000, "1M"], [2_000_000, "2M, as in PetriRL"], [5_000_000, "5M"]];

export async function trainView(root, jobId) {
  const jobs = await api("/api/train");
  if (!jobId) {
    const live = jobs.find((j) => j.status === "running" || j.status === "queued");
    if (live) jobId = live.id;
  }

  const lib = instancePicker(state.trainInstances, () => renderSize());
  const sizeNote = h("div", { class: "size-note" });
  const renderSize = () => {
    const picked = state.instances.filter((i) => state.trainInstances.has(i.id));
    const sizes = new Set(picked.map((i) => `${i.n_jobs}×${i.n_machines}`));
    sizeNote.className = "size-note";
    if (!picked.length) sizeNote.textContent = "Pick the instance(s) to train on. The agent will solve instances of the same size.";
    else if (sizes.size > 1) {
      sizeNote.classList.add("bad");
      sizeNote.textContent = `These instances have different sizes (${[...sizes].join(", ")}). An agent works on one net size: keep one size.`;
    } else {
      const [nj, nm] = [picked[0].n_jobs, picked[0].n_machines];
      const obs = 32 + 34 * nj + 63 * nm;
      const e = envOf(env);
      const wait = standby !== "off" && e.supports_standby;
      const actions = e.fixed_actions ? `${e.fixed_actions} actions (one per heuristic, each makes ${+optionInputs.commitment_length?.value || "k"} decisions)`
        : `${nj + wait} actions (one per job${wait ? ", plus wait" : ""})`;
      sizeNote.textContent = `The agent will be a ${e.title.toLowerCase()} ${nj}×${nm} agent: ${obs} observation features, ${actions}.`;
    }
    startBtn.disabled = !picked.length || sizes.size > 1;
  };

  const name = h("input", { class: "input", placeholder: "Named after the size and instance" });
  const steps = h("select", { class: "input" }, STEP_PRESETS.map(([v, l]) => h("option", { value: v }, l)));
  steps.value = "200000";
  let reward = "L";
  const rewardSeg = h("div", { class: "seg" });
  const renderReward = () => rewardSeg.replaceChildren(...[["L", "Lower bound (dense)"], ["G", "Makespan (time)"]].map(([k, l]) =>
    h("button", { class: reward === k ? "on" : "", type: "button", onclick: () => { reward = k; renderReward(); } }, l)));
  renderReward();
  let env = state.env;
  const optionInputs = {};
  const optionBox = h("div", { class: "form-grid wide" });
  const standbyField = h("div", { class: "field wide" });
  const renderEnvFields = () => {
    const e = envOf(env);
    optionBox.replaceChildren(...Object.entries(e.options || {}).map(([k, spec]) => {
      optionInputs[k] = h("input", { class: "input", type: "number", min: spec.min, max: spec.max, value: spec.default,
        oninput: () => renderSize() });
      return h("label", { class: "field" }, h("span", {}, spec.label), optionInputs[k]);
    }));
    for (const k of Object.keys(optionInputs)) if (!(k in (e.options || {}))) delete optionInputs[k];
    standbyField.classList.toggle("hidden", !e.supports_standby);
  };
  const envSeg = seg(state.envs.map((e) => [e.name, e.title]), env, (v) => { env = v; setEnv(v); renderEnvFields(); renderSize(); });
  let standby = "off";
  const STANDBY_HELP = {
    off: "The agent must release a job whenever one can start.",
    on: "The agent may also wait until the next operation finishes, whenever an operation is running.",
    gt: "Waiting is offered only when another job could reach the machine before the free job would finish there (Giffler-Thompson condition), so fewer useless waits.",
  };
  const standbyHelp = h("small", {}, STANDBY_HELP.off);
  const standbySeg = seg([["off", "Off"], ["on", "Always"], ["gt", "When useful"]], "off", (v) => {
    standby = v; standbyHelp.textContent = STANDBY_HELP[v]; renderSize();
  });
  const randomVar = h("input", { type: "checkbox", checked: true });
  const gradient = h("input", { type: "checkbox" });
  const adv = {
    n_envs: h("input", { class: "input", type: "number", min: 1, max: 8, value: 2 }),
    rollout_size: h("input", { class: "input", type: "number", min: 256, step: 256, value: 2048 }),
    batch_size: h("input", { class: "input", type: "number", min: 32, step: 32, value: 256 }),
    learning_rate: h("input", { class: "input", type: "number", step: "0.0001", value: 0.0003 }),
    net_arch: h("input", { class: "input", value: "64, 64" }),
    ent_coef: h("input", { class: "input", type: "number", step: "0.001", value: 0.001 }),
    seed: h("input", { class: "input", type: "number", value: 0 }),
  };
  const startBtn = h("button", { class: "btn primary big", style: { width: "100%", marginTop: "18px" } }, "Start training");
  startBtn.addEventListener("click", async () => {
    startBtn.disabled = true;
    try {
      const job = await api("/api/train", { json: {
        instance_ids: [...state.trainInstances], name: name.value.trim(), total_steps: +steps.value, reward,
        random_instances: randomVar.checked, gradient: gradient.checked,
        env, standby: envOf(env).supports_standby ? standby : "off",
        ...Object.fromEntries(Object.entries(optionInputs).map(([k, el]) => [k, +el.value])),
        n_envs: +adv.n_envs.value, rollout_size: +adv.rollout_size.value, batch_size: +adv.batch_size.value,
        learning_rate: +adv.learning_rate.value, ent_coef: +adv.ent_coef.value, seed: +adv.seed.value,
        net_arch: adv.net_arch.value.split(/[ ,]+/).filter(Boolean).map(Number),
      } });
      location.hash = `#/train/${job.id}`;
    } catch (e) { toast(e.message, "error"); startBtn.disabled = false; }
  });

  const fieldOf = (label, el, hint, wide) => h("label", { class: `field${wide ? " wide" : ""}` }, h("span", {}, label), el, hint ? h("small", {}, hint) : null);
  const form = h("section", { class: "panel" },
    h("div", { class: "panel-head" }, h("div", {}, h("h2", {}, "New agent"), h("p", {}, "Instances, then settings"))),
    h("div", { class: "panel-body" },
      h("span", { class: "field-label" }, "Training instances"),
      lib.el,
      dropZone({ slim: true, accept: ".txt,text/plain,*", title: "Drop instance files", hint: "or click to browse",
        onFiles: async (files) => {
          try {
            const added = await uploadInstances(files);
            added.forEach((a) => state.trainInstances.add(a.id));
            lib.render(); renderSize();
          } catch (e) { toast(e.message, "error"); }
        } }),
      h("details", { class: "inline-more" }, h("summary", {}, "Generate a random instance"),
        randomForm((rec) => { state.trainInstances.add(rec.id); lib.render(); renderSize(); })),
      sizeNote,
      h("div", { class: "form-grid", style: { marginTop: "18px" } },
        h("div", { class: "field wide" }, h("span", {}, "Environment"), envSeg,
          h("small", {}, "Dispatching: one action releases one job. Hyper-heuristic: one action picks a rule for the next k decisions.")),
        optionBox,
        fieldOf("Agent name", name, null, true),
        fieldOf("Training steps", steps, "One step is one agent decision", true),
        h("div", { class: "field wide" }, h("span", {}, "Reward"), rewardSeg,
          h("small", {}, "Lower bound: each step pays the drop of the makespan bound. Makespan: each step pays minus the time that passed. Both sum to the makespan.")),
        standbyField,
        h("label", { class: "switch wide" }, randomVar, "Train on random variants of the same size"),
        h("label", { class: "switch wide" }, gradient, "Push down masked actions (mask gradient)")),
      h("details", { class: "adv" }, h("summary", {}, "PPO settings"),
        h("div", { class: "form-grid" },
          fieldOf("Parallel envs", adv.n_envs), fieldOf("Rollout size", adv.rollout_size),
          fieldOf("Batch size", adv.batch_size), fieldOf("Learning rate", adv.learning_rate, "decays linearly to 0"),
          fieldOf("Hidden layers", adv.net_arch, "policy and value nets"), fieldOf("Entropy coefficient", adv.ent_coef),
          fieldOf("Seed", adv.seed))),
      startBtn));

  const dash = h("div", { class: "dash" });
  root.replaceChildren(
    h("div", { class: "page-head" }, h("div", {}, h("h1", {}, "Train"),
      h("p", {}, "The agent learns on the Petri net of one instance size, with MaskablePPO and gamma 1. With random variants on, it learns the whole size class instead of one instance."))),
    h("div", { class: "train-grid" }, form, dash));
  standbyField.append(h("span", {}, "Wait action (standby)"), standbySeg, standbyHelp);
  renderEnvFields();
  renderSize();

  let stop = () => {};
  if (jobId) stop = liveJob(dash, jobId);
  else renderJobList(dash, jobs);
  return () => { stop(); lib.destroy(); };
}

function renderJobList(dash, jobs) {
  dash.replaceChildren(h("section", { class: "panel" },
    h("div", { class: "panel-head" }, h("div", {}, h("h2", {}, "Training runs"), h("p", {}, "Jobs started since the server started"))),
    h("div", { class: "panel-body" }, jobs.length
      ? h("div", { class: "jobs-list" }, jobs.map((j) => h("a", { class: "row-item", href: `#/train/${j.id}`, style: { gridTemplateColumns: "1fr auto auto", textDecoration: "none", color: "inherit" } },
        h("div", {}, h("div", { class: "name" }, j.config.name), h("div", { class: "meta" }, `${fmt.int(j.timesteps)} of ${fmt.int(j.total_steps)} steps`)),
        h("span", { class: "chip" }, j.best != null ? `best ${j.best}` : "no evaluation yet"),
        statusChip(j.status))))
      : h("div", { class: "empty" }, h("b", {}, "Nothing is training"), "Choose instances and settings on the left, then start. The learning curve appears here."))));
}

function statusChip(st) {
  const map = { running: ["blue", "Training"], queued: ["", "Waiting"], done: ["green", "Saved"], failed: ["red", "Failed"], cancelled: ["amber", "Stopped"] };
  const [c, l] = map[st] || ["", st];
  return h("span", { class: `chip ${c}` }, l);
}

function liveJob(dash, jid) {
  let episodes = [], nLogs = 0, timer = null, alive = true, lastState = null;
  const ring = ringSVG();
  const stats = h("div", { class: "dash-stats" });
  const canvas = h("canvas");
  const logEl = h("div", { class: "log" });
  const stopBtn = h("button", { class: "btn danger" }, "Stop and save");
  const title = h("h2");
  const chip = h("span");
  const doneSlot = h("div");
  const refKey = h("span", {}, h("i", { style: { background: "repeating-linear-gradient(90deg,#1E2229 0 4px,transparent 4px 7px)" } }), "reference");
  stopBtn.addEventListener("click", async () => { stopBtn.disabled = true; await api(`/api/train/${jid}/cancel`, { method: "POST" }); });

  dash.replaceChildren(
    doneSlot,
    h("section", { class: "panel" },
      h("div", { class: "panel-head" }, h("div", { style: { display: "flex", gap: "10px", alignItems: "center" } }, title, chip),
        h("div", { class: "toolbar" }, stopBtn)),
      h("div", { class: "dash-top" }, ring.el, stats)),
    h("section", { class: "panel" },
      h("div", { class: "panel-head" }, h("div", {}, h("h2", {}, "Learning curve"), h("p", {}, "Makespan per episode during training, and the greedy agent on the training instances after each rollout"))),
      h("div", { class: "chart-box" }, canvas),
      h("div", { class: "chart-key" },
        h("span", {}, h("i", { style: { background: "#B9C1CB", height: "6px", width: "6px", borderRadius: "50%" } }), "training episode"),
        h("span", {}, h("i", { style: { background: "#2F5BEA" } }), "moving average"),
        h("span", {}, h("i", { style: { background: "#E09A2C" } }), "greedy evaluation"),
        refKey)),
    h("section", { class: "panel" }, h("div", { class: "panel-head" }, h("h3", {}, "Log")), logEl));

  const ro = new ResizeObserver(() => lastState && drawChart(canvas, episodes, lastState));
  ro.observe(canvas);

  const poll = async () => {
    if (!alive) return;
    try {
      const st = await api(`/api/train/${jid}?since_ep=${episodes.length}&since_log=${nLogs}`);
      lastState = st;
      episodes = episodes.concat(st.episodes);
      nLogs = st.n_logs;
      title.textContent = st.config.name;
      const kinds = new Set(st.instances.map((i) => i.reference?.kind || "lower bound"));
      refKey.lastChild.textContent = kinds.size === 1 ? [...kinds][0] : "optimum / best known";
      chip.replaceChildren(statusChip(st.status));
      ring.set(st.progress, st.status);
      stats.replaceChildren(
        stat("Steps", `${fmt.int(st.timesteps)} / ${fmt.int(st.total_steps)}`),
        stat("Episodes", fmt.int(st.n_episodes)),
        stat("Best greedy makespan", st.best ?? "–"),
        stat(st.status === "running" ? "Time left" : "Training time", st.status === "running" ? fmt.dur(st.eta) : fmt.dur(st.elapsed)),
        stat("Speed", `${fmt.int(st.fps)} steps/s`),
        stat("Instances", st.instances.map((i) => i.name).join(", ")),
        stat("Size", `${st.instances[0].n_jobs}×${st.instances[0].n_machines}`),
        stat("Reward", st.config.reward === "L" ? "lower bound" : "makespan"),
        stat("Environment", envOf(st.config.env).title + (st.config.options?.commitment_length ? `, k = ${st.config.options.commitment_length}` : "")),
        stat("Wait action", { off: "off", on: "always", gt: "when useful" }[st.config.standby] || "off"));
      for (const line of st.logs) logEl.append(line + "\n");
      logEl.scrollTop = logEl.scrollHeight;
      drawChart(canvas, episodes, st);
      const finished = ["done", "failed", "cancelled"].includes(st.status);
      stopBtn.classList.toggle("hidden", finished);
      if (finished) {
        if (st.agent_id) {
          await refreshLibrary();
          doneSlot.replaceChildren(h("div", { class: "done-card" },
            h("div", {}, h("h3", {}, `Agent saved: ${st.config.name}`),
              h("p", { class: "muted" }, `Best greedy makespan ${st.best ?? "–"} on the training instances. It is now in your agent library.`)),
            h("div", { class: "toolbar" },
              h("a", { class: "btn", href: `/api/agents/${st.agent_id}/download` }, "Download .zip"),
              h("button", { class: "btn primary", onclick: () => {
                state.pickedAgents.add(st.agent_id);
                st.instances.forEach((i) => state.pickedInstances.add(i.id));
                location.hash = "#/solve";
              } }, "Solve with this agent"))));
        } else if (st.status === "failed") {
          doneSlot.replaceChildren(h("div", { class: "done-card", style: { background: "var(--red-soft)", borderColor: "#F1C2BE" } },
            h("div", {}, h("h3", { style: { color: "#A0302A" } }, "Training failed"), h("p", {}, st.error))));
        }
        return;
      }
    } catch (e) { toast(e.message, "error"); }
    timer = setTimeout(poll, 1500);
  };
  poll();
  return () => { alive = false; clearTimeout(timer); ro.disconnect(); };
}

function stat(label, value) { return h("div", {}, h("span", {}, label), h("strong", { style: { fontSize: String(value).length > 14 ? "14px" : null } }, value)); }
