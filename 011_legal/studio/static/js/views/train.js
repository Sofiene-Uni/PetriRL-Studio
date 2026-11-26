// Train view: instances of one size, training settings, live dashboard (progress, learning curve, log).
import { dropZone } from "../components/dropzone.js";
import { randomForm, uploadInstances } from "../components/instance-actions.js";
import { instancePicker } from "../components/pickers.js";
import { seg } from "../components/segmented.js";
import { drawChart, ringSVG } from "../components/learning-chart.js";
import { api } from "../core/api.js";
import { h } from "../core/dom.js";
import { fmt } from "../core/format.js";
import { envOf, refreshLibrary, state } from "../core/state.js";
import { toast } from "../core/ui.js";
import { t } from "../core/i18n.js";

const STEP_PRESETS = [[50_000, "50k"], [200_000, "200k"], [500_000, "500k"], [1_000_000, "1M"], [2_000_000, "2M"], [5_000_000, "5M"]];
const MAX_STEPS = 20_000_000;

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
    if (!picked.length) sizeNote.textContent = t("Pick the instance(s) to train on. The agent will solve instances of the same size.");
    else if (sizes.size > 1) {
      sizeNote.classList.add("bad");
      sizeNote.textContent = t("These instances have different sizes ({sizes}). An agent works on one net size: keep one size.", { sizes: [...sizes].join(", ") });
    } else {
      const [nj, nm] = [picked[0].n_jobs, picked[0].n_machines];
      const obs = 32 + 34 * nj + 63 * nm;
      const e = envOf(env);
      const wait = !!e.forced_standby || (standby !== "off" && e.supports_standby);
      const actions = e.fixed_actions ? t("{n} actions (one per heuristic, each makes {k} decisions)", { n: e.fixed_actions, k: +optionInputs.commitment_length?.value || "k" })
        : (wait ? t("{n} actions (one per job, plus wait)", { n: nj + wait }) : t("{n} actions (one per job)", { n: nj + wait }));
      sizeNote.textContent = t("The agent will be a {env} {size} agent: {obs} observation features, {actions}.", { env: t(e.title), size: `${nj}×${nm}`, obs, actions });
    }
    startBtn.disabled = !picked.length || sizes.size > 1;
  };

  const name = h("input", { class: "input", placeholder: t("Named after the size and instance") });
  // any budget can be typed; the presets only fill the field
  const steps = h("input", { class: "input", type: "number", min: 2048, max: MAX_STEPS, step: 1000, value: 200000 });
  const stepPresets = h("div", { class: "step-presets" }, ...STEP_PRESETS.map(([v, l]) =>
    h("button", { type: "button", class: "chip", onclick: () => { steps.value = v; } }, l)));
  let reward = "L";
  const rewardSeg = h("div", { class: "seg" });
  const renderReward = () => rewardSeg.replaceChildren(...[["L", t("Lower bound (dense)")], ["G", t("Makespan (time)")]].map(([k, l]) =>
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
    standbyField.classList.toggle("hidden", !e.supports_standby || !!e.forced_standby);
  };
  // the environment is chosen once, on the home page; follow it if it changes
  const envNote = h("div", { class: "env-note" });
  const showEnv = () => envNote.replaceChildren(h("b", {}, t(envOf(env).title)), h("span", {}, t(envOf(env).description)),
    h("a", { href: "#/" }, t("Change on the home page")));
  const onEnv = () => { env = state.env; showEnv(); renderEnvFields(); renderSize(); };
  document.addEventListener("envchange", onEnv);
  showEnv();
  let standby = "off";
  const STANDBY_HELP = {
    off: t("The agent must release a job whenever one can start."),
    on: t("The agent may also wait until the next operation finishes, whenever an operation is running."),
    gt: t("Waiting is offered only when another job could reach the machine before the free job would finish there (Giffler-Thompson condition), so fewer useless waits."),
  };
  const standbyHelp = h("small", {}, STANDBY_HELP.off);
  const standbySeg = seg([["off", t("Off")], ["on", t("Always")], ["gt", t("When useful")]], "off", (v) => {
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
  const startBtn = h("button", { class: "btn primary big", style: { width: "100%", marginTop: "18px" } }, t("Start training"));
  startBtn.addEventListener("click", async () => {
    const budget = Math.round(+steps.value);
    if (!(budget >= 2048 && budget <= MAX_STEPS)) { toast(t("Training steps: type a number from 2,048 to 20,000,000"), "error"); steps.focus(); return; }
    startBtn.disabled = true;
    try {
      const job = await api("/api/train", { json: {
        instance_ids: [...state.trainInstances], name: name.value.trim(), total_steps: budget, reward,
        random_instances: randomVar.checked, gradient: gradient.checked,
        env, standby: envOf(env).forced_standby || (envOf(env).supports_standby ? standby : "off"),
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
    h("div", { class: "panel-head" }, h("div", {}, h("h2", {}, t("New agent")), h("p", {}, t("Instances, then settings")))),
    h("div", { class: "panel-body" },
      h("span", { class: "field-label" }, t("Training instances")),
      lib.el,
      dropZone({ slim: true, accept: ".txt,text/plain,*", title: t("Drop instance files"), hint: t("or click to browse"),
        onFiles: async (files) => {
          try {
            const added = await uploadInstances(files);
            added.forEach((a) => state.trainInstances.add(a.id));
            lib.render(); renderSize();
          } catch (e) { toast(e.message, "error"); }
        } }),
      h("details", { class: "inline-more" }, h("summary", {}, t("Generate a random instance")),
        randomForm((rec) => { state.trainInstances.add(rec.id); lib.render(); renderSize(); })),
      sizeNote,
      h("div", { class: "form-grid", style: { marginTop: "18px" } },
        h("div", { class: "field wide" }, h("span", {}, t("Environment")), envNote),
        optionBox,
        fieldOf(t("Agent name"), name, null, true),
        fieldOf(t("Training steps"), h("div", { class: "steps-field" }, steps, stepPresets), t("One step is one agent decision; type any number up to 20M"), true),
        h("div", { class: "field wide" }, h("span", {}, t("Reward")), rewardSeg,
          h("small", {}, t("Lower bound: each step pays the drop of the makespan bound. Makespan: each step pays minus the time that passed. Both sum to the makespan."))),
        standbyField,
        h("label", { class: "switch wide" }, randomVar, t("Train on random variants of the same size")),
        h("label", { class: "switch wide" }, gradient, t("Push down masked actions (mask gradient)"))),
      h("details", { class: "adv" }, h("summary", {}, t("PPO settings")),
        h("div", { class: "form-grid" },
          fieldOf(t("Parallel envs"), adv.n_envs), fieldOf(t("Rollout size"), adv.rollout_size),
          fieldOf(t("Batch size"), adv.batch_size), fieldOf(t("Learning rate"), adv.learning_rate, "decays linearly to 0"),
          fieldOf(t("Hidden layers"), adv.net_arch, "policy and value nets"), fieldOf(t("Entropy coefficient"), adv.ent_coef),
          fieldOf(t("Seed"), adv.seed))),
      startBtn));

  const dash = h("div", { class: "dash" });
  root.replaceChildren(
    h("div", { class: "page-head" }, h("div", {}, h("h1", {}, t("Train")),
      h("p", {}, t("The agent learns on the Petri net of one instance size, with MaskablePPO and gamma 1. With random variants on, it learns the whole size class instead of one instance.")))),
    h("div", { class: "train-grid" }, form, dash));
  standbyField.append(h("span", {}, t("Wait action (standby)")), standbySeg, standbyHelp);
  renderEnvFields();
  renderSize();

  let stop = () => {};
  if (jobId) stop = liveJob(dash, jobId);
  else renderJobList(dash, jobs);
  return () => { stop(); lib.destroy(); document.removeEventListener("envchange", onEnv); };
}

function renderJobList(dash, jobs) {
  dash.replaceChildren(h("section", { class: "panel" },
    h("div", { class: "panel-head" }, h("div", {}, h("h2", {}, t("Training runs")), h("p", {}, t("Jobs started since the server started")))),
    h("div", { class: "panel-body" }, jobs.length
      ? h("div", { class: "jobs-list" }, jobs.map((j) => h("a", { class: "row-item", href: `#/train/${j.id}`, style: { gridTemplateColumns: "1fr auto auto", textDecoration: "none", color: "inherit" } },
        h("div", {}, h("div", { class: "name" }, j.config.name), h("div", { class: "meta" }, t("{n} of {total} steps", { n: fmt.int(j.timesteps), total: fmt.int(j.total_steps) }))),
        h("span", { class: "chip" }, j.best != null ? t("best {n}", { n: j.best }) : "no evaluation yet"),
        statusChip(j.status))))
      : h("div", { class: "empty" }, h("b", {}, t("Nothing is training")), t("Choose instances and settings on the left, then start. The learning curve appears here.")))));
}

function statusChip(st) {
  const map = { running: ["blue", t("Training")], queued: ["", t("Waiting")], done: ["green", t("Saved")], failed: ["red", t("Failed")], cancelled: ["amber", t("Stopped")] };
  const [c, l] = map[st] || ["", st];
  return h("span", { class: `chip ${c}` }, l);
}

function liveJob(dash, jid) {
  let episodes = [], nLogs = 0, timer = null, alive = true, lastState = null;
  const ring = ringSVG();
  const stats = h("div", { class: "dash-stats" });
  const canvas = h("canvas");
  const logEl = h("div", { class: "log" });
  const stopBtn = h("button", { class: "btn danger" }, t("Stop and save"));
  const mileBtn = h("button", { class: "btn", title: t("Save the current agent to your library and keep training") }, t("Save milestone"));
  const mileList = h("div", { class: "milestones" });
  let nMiles = 0;
  const title = h("h2");
  const chip = h("span");
  const doneSlot = h("div");
  const refKey = h("span", {}, h("i", { style: { background: "repeating-linear-gradient(90deg,#1E2229 0 4px,transparent 4px 7px)" } }), t("reference"));
  stopBtn.addEventListener("click", async () => { stopBtn.disabled = true; await api(`/api/train/${jid}/cancel`, { method: "POST" }); });
  mileBtn.addEventListener("click", async () => {
    mileBtn.disabled = true;
    try { await api(`/api/train/${jid}/milestone`, { method: "POST" }); } catch (e) { toast(e.message, "error"); mileBtn.disabled = false; }
  });

  dash.replaceChildren(
    doneSlot,
    h("section", { class: "panel" },
      h("div", { class: "panel-head" }, h("div", { style: { display: "flex", gap: "10px", alignItems: "center" } }, title, chip),
        h("div", { class: "toolbar" }, mileBtn, stopBtn)),
      h("div", { class: "dash-top" }, ring.el, stats),
      mileList),
    h("section", { class: "panel" },
      h("div", { class: "panel-head" }, h("div", {}, h("h2", {}, t("Learning curve")), h("p", {}, t("Makespan per episode during training, and the greedy agent on the training instances after each rollout")))),
      h("div", { class: "chart-box" }, canvas),
      h("div", { class: "chart-key" },
        h("span", {}, h("i", { style: { background: "#B9C1CB", height: "6px", width: "6px", borderRadius: "50%" } }), t("training episode")),
        h("span", {}, h("i", { style: { background: "#2F5BEA" } }), t("moving average")),
        h("span", {}, h("i", { style: { background: "#E09A2C" } }), t("greedy evaluation")),
        refKey)),
    h("section", { class: "panel" }, h("div", { class: "panel-head" }, h("h3", {}, t("Log"))), logEl));

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
      refKey.lastChild.textContent = kinds.size === 1 ? t([...kinds][0]) : t("optimum / best known");
      chip.replaceChildren(statusChip(st.status),
        ...(st.status === "queued" && st.position ? [h("span", { class: "queue-note" }, fmt.inLine(st.position))] : []));
      ring.set(st.progress, st.status);
      stats.replaceChildren(
        stat(t("Steps"), `${fmt.int(st.timesteps)} / ${fmt.int(st.total_steps)}`),
        stat(t("Episodes"), fmt.int(st.n_episodes)),
        stat(t("Best greedy makespan"), st.best ?? "–"),
        stat(st.status === "running" ? t("Time left") : t("Training time"), st.status === "running" ? fmt.dur(st.eta) : fmt.dur(st.elapsed)),
        stat(t("Speed"), t("{steps} steps/s, {eps} episodes/s", { steps: fmt.int(st.fps), eps: st.elapsed > 0 ? (st.n_episodes / st.elapsed).toFixed(st.n_episodes / st.elapsed < 10 ? 2 : 0) : "0" })),
        stat(t("Instances"), st.instances.map((i) => i.name).join(", ")),
        stat(t("Size"), `${st.instances[0].n_jobs}×${st.instances[0].n_machines}`),
        stat(t("Reward"), st.config.reward === "L" ? t("lower bound") : t("makespan")),
        stat(t("Environment"), t(envOf(st.config.env).title) + (st.config.options?.commitment_length ? `, k = ${st.config.options.commitment_length}` : "")),
        stat(t("Wait action"), t({ off: "off", on: "always", gt: "when useful" }[st.config.standby] || "off")),
        ...(st.phase ? [stat(t("Phase"), t({ expert: "tabu search solves the instances", cloning: "cloning the expert", ppo: "PPO fine-tuning" }[st.phase]))] : []));
      for (const line of st.logs) logEl.append(line + "\n");
      logEl.scrollTop = logEl.scrollHeight;
      drawChart(canvas, episodes, st);
      const finished = ["done", "failed", "cancelled"].includes(st.status);
      stopBtn.classList.toggle("hidden", finished);
      mileBtn.classList.toggle("hidden", finished || st.status !== "running");
      if (st.milestones.length !== nMiles) {
        nMiles = st.milestones.length;
        mileBtn.disabled = false;
        await refreshLibrary();
        mileList.replaceChildren(h("span", { class: "muted" }, t("Milestones")), ...st.milestones.map((m) =>
          h("a", { class: "chip", href: `/api/agents/${m.agent_id}/download`, title: t("Download .zip") },
            t("{steps} steps, makespan {n}", { steps: fmt.int(m.steps), n: m.makespan ?? "–" }))));
      }
      if (finished) {
        if (st.agent_id) {
          await refreshLibrary();
          doneSlot.replaceChildren(h("div", { class: "done-card" },
            h("div", {}, h("h3", {}, t("Agent saved: {name}", { name: st.config.name })),
              h("p", { class: "muted" }, t("Best greedy makespan {n} on the training instances. It is now in your agent library.", { n: st.best ?? "–" }))),
            h("div", { class: "toolbar" },
              h("a", { class: "btn", href: `/api/agents/${st.agent_id}/download` }, t("Download .zip")),
              h("button", { class: "btn primary", onclick: () => {
                state.pickedAgents.add(st.agent_id);
                st.instances.forEach((i) => state.pickedInstances.add(i.id));
                location.hash = "#/solve";
              } }, t("Solve with this agent")))));
        } else if (st.status === "failed") {
          doneSlot.replaceChildren(h("div", { class: "done-card", style: { background: "var(--red-soft)", borderColor: "#F1C2BE" } },
            h("div", {}, h("h3", { style: { color: "#A0302A" } }, t("Training failed")), h("p", {}, st.error))));
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
