"""Runs one episode (instance x agent) and records every transition firing for the replay."""
import json
import os
import time

import numpy as np

from engine.core import standby_mode
from engine.envs import DEFAULT_ENV, get_env_class, make_env
from engine.policies import choose, make_rng
from studio.services import agent_library as agents
from studio.services import instance_library as instances
from studio.services import storage

FOLDER = "runs"


def _tokens(sim):
    out = {}
    for p in sim.cache["places"]:
        for t in p.token_container:
            out[t.uid] = [t.color[0], t.color[1], t.rank, t.time_features[0]]
    return out


def _marking(sim):
    return {p.uid: [t.uid for t in p.token_container] for p in sim.cache["places"] if p.token_container}


def _policy_probs(model, obs, mask):
    """Probability the policy gives to every action (masked), for the decision inspector."""
    try:
        obs_t, _ = model.policy.obs_to_tensor(obs)
        dist = model.policy.get_distribution(obs_t, action_masks=mask)
        return dist.distribution.probs[0].detach().cpu().numpy()
    except Exception:  # noqa: BLE001  (inspector is optional)
        return None


def run(instance_id, agent_id, deterministic=True, seed=0, save=True):
    inst_rec = instances.get(instance_id)
    agent = agents.get(agent_id)
    if not agents.compatible(agent, inst_rec):
        raise ValueError(f"agent '{agent['name']}' was trained for {agent['n_jobs']}x{agent['n_machines']}, "
                         f"instance '{inst_rec['name']}' is {inst_rec['n_jobs']}x{inst_rec['n_machines']}")
    inst = instances.load(instance_id)
    is_rule = agent["kind"] == "rule"
    model = None if is_rule else agents.load_model(agent_id)
    mode = "off" if is_rule else standby_mode(agent.get("standby"))
    env_name = DEFAULT_ENV if is_rule else agent.get("env", DEFAULT_ENV)       # rules dispatch directly
    env_cls = get_env_class(env_name)
    options = {k: agent.get(k, spec["default"]) for k, spec in env_cls.options.items()}
    env = make_env(inst, name=env_name, reward_f="L", standby=mode, normalize=agent.get("normalize", True), **options)
    if model is not None and model.observation_space.shape != env.observation_space.shape:
        raise ValueError("observation size of the agent does not match this instance")

    sim = env.sim
    obs, _ = env.reset(seed=seed)
    tokens, initial = _tokens(sim), _marking(sim)
    keys = env.action_keys()
    events, decisions, macros = [], [], []      # decisions: every job released; macros: hyper-heuristic choices

    def observer(transition, clock, popped, token):
        events.append([clock, transition.uid, popped, token.uid, [c.uid for c in transition.children]])

    def job_decision(action, probs=None):
        """One dispatching decision on the net (the agent's action, or a heuristic's inside a macro step)."""
        en = [i for i, m in enumerate(sim.mask) if m and i != sim.standby_index]
        tr = sim.action_map[action]
        d = {"e": len(events), "clock": sim.clock, "action": action,
             "job": tr.color if tr.role == "job_select" else None, "wait": action == sim.standby_index,
             "enabled": [sim.action_map[i].color for i in en],
             "wait_enabled": sim.standby_index is not None and bool(sim.mask[sim.standby_index]), "probs": probs}
        if macros:
            d["macro"], d["step"] = len(macros) - 1, len(decisions) - macros[-1]["first"]
        decisions.append(d)

    hyper = hasattr(env, "on_dispatch")
    if hyper:
        env.on_dispatch = job_decision
    sim.set_observer(observer)
    rng = make_rng(seed)
    t0, done, terminated = time.perf_counter(), False, False
    while not done:
        mask = env.action_masks()
        enabled = [int(i) for i in np.flatnonzero(mask)]
        probs = None
        if is_rule:
            action = choose(agent["name"], sim, mask, rng)
        else:
            action = int(model.predict(obs, action_masks=mask, deterministic=deterministic)[0])
            p = _policy_probs(model, obs, mask)
            probs = None if p is None else {keys[i]: round(float(p[i]), 4) for i in enabled}
        if hyper:
            macros.append({"clock": sim.clock, "action": action, "heuristic": keys[action], "probs": probs,
                           "enabled": [keys[i] for i in enabled], "first": len(decisions)})
        else:
            job_decision(action, probs)
        obs, _, terminated, truncated, _ = env.step(action)
        done = terminated or truncated
    runtime = time.perf_counter() - t0
    sim.set_observer(None)

    pub = instances.public(inst_rec)
    ref, lb, ms = pub["reference"], inst_rec["lb"], sim.clock
    rid = storage.new_id("run")
    record = {
        "id": rid, "created": storage.now(), "status": "done" if terminated else "truncated",
        "instance": {k: pub.get(k) for k in ("id", "name", "problem_type", "family", "n_jobs", "n_machines", "n_ops", "lb")},
        "agent": {k: agent.get(k) for k in ("id", "name", "kind", "source", "net_arch", "obs_dim", "reward", "env")},
        "deterministic": deterministic, "standby": mode,
        "env": {"name": env_name, "title": env_cls.title, **options}, "action_keys": keys, "macros": macros,
        "makespan": ms, "reference": ref, "gap": round(100 * (ms - ref["value"]) / ref["value"], 2),
        "lb": lb, "gap_lb": round(100 * (ms - lb) / lb, 2),
        "n_decisions": len(decisions), "runtime_ms": round(1000 * runtime, 1),
        "net": sim.structure(), "tokens": tokens, "initial": initial,
        "events": events, "decisions": decisions, "schedule": sim.schedule(),
    }
    if not save:
        return record
    storage.write_json(storage.path(FOLDER, f"{rid}.json"), record)
    _index_append(summary(record))
    return summary(record)


SUMMARY_KEYS = ("id", "created", "status", "instance", "agent", "env", "makespan", "reference", "gap", "lb", "gap_lb",
                "n_decisions", "runtime_ms", "deterministic", "standby")
INDEX = "index.jsonl"          # one summary per line, so listing never opens the (large) run files


def summary(rec):
    return {k: rec[k] for k in SUMMARY_KEYS if k in rec}


def _index_path():
    return storage.path(FOLDER, INDEX)


def _index_append(s):
    with open(_index_path(), "a") as f:
        f.write(json.dumps(s, separators=(",", ":")) + "\n")


def _read_index():
    path = _index_path()
    if not os.path.exists(path):                     # runs saved before the index existed
        folder = storage.path(FOLDER)
        files = sorted((os.path.join(folder, f) for f in os.listdir(folder) if f.endswith(".json")), key=os.path.getmtime)
        for f in files:
            try:
                _index_append(summary(storage.read_json(f)))
            except (OSError, ValueError):
                pass
        if not os.path.exists(path):
            return []
    with open(path) as f:
        return [json.loads(line) for line in f if line.strip()]


def get(rid):
    f = storage.path(FOLDER, f"{storage.slug(rid)}.json")
    if not os.path.exists(f):
        raise KeyError(f"run {rid} not found")
    return storage.read_json(f)


def list_recent(limit=100):
    return _read_index()[::-1][:limit]


def best_by_instance():
    """instance id -> the finished run with the smallest makespan."""
    best = {}
    for s in _read_index():
        iid = s["instance"]["id"]
        if s.get("status") == "done" and (iid not in best or s["makespan"] < best[iid]["makespan"]):
            best[iid] = s
    return best
