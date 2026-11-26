"""Background training jobs (MaskablePPO on the Petri net env), one at a time, with live progress."""
import os
import threading
import time
import traceback

import numpy as np

from engine.core import standby_mode
from engine.envs import DEFAULT_ENV, get_env_class, make_env
from engine.instances import Instance
from studio.services import agent_library as agents
from studio.services import compute_queue
from studio.services import instance_library as instances
from studio.services import storage

_jobs, _lock = {}, threading.Lock()

DEFAULTS = {"name": "", "env": DEFAULT_ENV, "standby": "off", "total_steps": 100_000, "reward": "L", "random_instances": True, "gradient": False,
            "n_envs": 2, "rollout_size": 2048, "batch_size": 256, "learning_rate": 3e-4,
            "net_arch": [64, 64], "ent_coef": 0.001, "seed": 0}


class Job:
    def __init__(self, config, inst_recs):
        self.id = storage.new_id("train")
        self.config = config
        self.instances = [{**{k: r[k] for k in ("id", "name", "n_jobs", "n_machines", "lb")},
                           "reference": instances.public(r)["reference"]} for r in inst_recs]
        self.status, self.error = "queued", None
        self.timesteps, self.started, self.finished = 0, None, None
        self.episodes = []      # [timestep, makespan, lb]
        self.evals = []         # [timestep, mean makespan on the training instances (greedy)]
        self.best = None
        self.logs = []
        self.cancel = False
        self.agent_id = None
        self.milestone = False                   # set by the UI: save the current agent, keep training
        self.milestones = []                     # [{agent_id, steps, makespan}]
        self.phase = None                        # OR-informed: expert, cloning, then ppo
        self.ticket = compute_queue.join()       # trainings and solves share one line

    def log(self, msg):
        self.logs.append(f"[{time.strftime('%H:%M:%S')}] {msg}")
        self.logs = self.logs[-300:]

    def state(self, since_ep=0, since_log=0):
        elapsed = (self.finished or time.time()) - self.started if self.started else 0
        fps = self.timesteps / elapsed if elapsed > 0 else 0
        total = self.config["total_steps"]
        return {"id": self.id, "status": self.status, "error": self.error, "config": self.config,
                "instances": self.instances, "timesteps": self.timesteps, "total_steps": total,
                "progress": min(1.0, self.timesteps / total), "elapsed": round(elapsed, 1), "fps": round(fps, 1),
                "eta": round((total - self.timesteps) / fps, 1) if fps > 0 and self.status == "running" else None,
                "n_episodes": len(self.episodes), "episodes": self.episodes[since_ep:],
                "evals": self.evals, "best": self.best, "logs": self.logs[since_log:], "n_logs": len(self.logs),
                "agent_id": self.agent_id, "milestones": self.milestones,
                "position": compute_queue.position(self.ticket) if self.status == "queued" else 0,
                "phase": self.phase}


def start(cfg, max_steps=20_000_000, max_envs=8):
    config = {**DEFAULTS, **{k: v for k, v in cfg.items() if k in DEFAULTS}}
    ids = cfg.get("instance_ids") or []
    if not ids:
        raise ValueError("drop at least one training instance")
    recs = [instances.get(i) for i in ids]
    if len({r.get("problem_type", "jssp") for r in recs}) > 1:
        raise ValueError("all training instances must be of the same problem type")
    sizes = {(r["n_jobs"], r["n_machines"]) for r in recs}
    if len(sizes) > 1:
        raise ValueError("all training instances must have the same size (the net, and so the agent, depends on it)")
    config["total_steps"] = int(np.clip(int(config["total_steps"]), 2_048, max_steps))
    config["n_envs"] = int(np.clip(int(config["n_envs"]), 1, max_envs))
    config["rollout_size"] = int(np.clip(int(config["rollout_size"]), 256, 65_536))
    config["batch_size"] = int(np.clip(int(config["batch_size"]), 32, config["rollout_size"]))
    config["net_arch"] = [int(np.clip(int(x), 8, 1024)) for x in config["net_arch"]][:4] or [64, 64]
    env_cls = get_env_class(config["env"])           # raises for an unknown env
    config["standby"] = env_cls.forced_standby or standby_mode(config["standby"])
    if config["standby"] != "off" and not env_cls.supports_standby:
        raise ValueError(f"the {env_cls.title.lower()} env has no wait action")
    config["options"] = {k: int(np.clip(int(cfg.get(k, spec["default"])), spec["min"], spec["max"]))
                         for k, spec in env_cls.options.items()}
    if config["reward"] not in ("G", "L"):
        raise ValueError("reward must be G or L")
    nj, nm = sizes.pop()
    if not config["name"]:
        config["name"] = f"PPO {'HH ' if env_cls.name == 'hyper' else ''}{nj}x{nm} on {recs[0]['name']}" + (f" +{len(recs) - 1}" if len(recs) > 1 else "")
    job = Job(config, recs)
    with _lock:
        _jobs[job.id] = job
    threading.Thread(target=_train, args=(job, recs), daemon=True).start()
    return job.state()


def get(jid):
    with _lock:
        if jid not in _jobs:
            raise KeyError(f"training job {jid} not found")
        return _jobs[jid]


def list_jobs():
    with _lock:
        return [j.state(since_ep=len(j.episodes), since_log=len(j.logs)) for j in _jobs.values()]


def _greedy_makespan(model, env):
    obs, _ = env.reset()
    done = False
    while not done:
        action = int(model.predict(obs, action_masks=env.action_masks(), deterministic=True)[0])
        obs, _, terminated, truncated, info = env.step(action)
        done = terminated or truncated
    return info.get("makespan") if terminated else None


def _train(job, recs):
    if not compute_queue.wait(job.ticket, cancelled=lambda: job.cancel):
        job.status, job.finished = "cancelled", time.time()
        return
    try:
        _run(job, recs)
    except Exception as e:  # noqa: BLE001  (reported in the UI)
        job.status, job.error = "failed", str(e)
        job.log("FAILED: " + str(e))
        traceback.print_exc()
    finally:
        job.finished = time.time()
        compute_queue.leave(job.ticket)


def _imitate(job, model, pool, nm, eval_envs, best_file):
    """OR-informed steps 1 and 2: tabu search solves the instances, the policy clones its decisions."""
    from engine.policies.imitation import behavior_clone, demonstrations
    c, opts = job.config, job.config["options"]
    rng = np.random.default_rng(c["seed"])
    job.phase, demos = "expert", []
    for i in range(opts["demos"]):
        if job.cancel:
            return
        inst = Instance([list(job_ops) for job_ops in pool[i % len(pool)]], nm)
        if c["random_instances"]:
            inst.sample_like(rng)
        d = demonstrations(inst, reward_f=c["reward"], seed=c["seed"] + i, evals=opts["expert_evals"])
        demos.append(d)
        job.log(f"expert {i + 1}/{opts['demos']}: tabu search makespan {d['makespan']}, "
                f"{len(d['obs'])} decisions, {d['waits']} waits")
    job.phase = "cloning"
    behavior_clone(model.policy, demos, epochs=opts["bc_epochs"], log=job.log, cancelled=lambda: job.cancel)
    ms = [_greedy_makespan(model, e) for e in eval_envs]
    if all(m is not None for m in ms):
        job.best = round(float(np.mean(ms)), 2)
        job.evals.append([0, job.best])
        model.save(best_file)
        job.log(f"cloned agent: greedy makespan {job.best} on the training instances, now PPO fine-tuning")


def _run(job, recs):
    import torch
    from stable_baselines3.common.callbacks import BaseCallback
    from stable_baselines3.common.vec_env import DummyVecEnv

    from engine.policies.mask_gradient import PushMaskablePPO, PushMaskedPolicy

    c = job.config
    torch.set_num_threads(int(os.environ.get("OMP_NUM_THREADS") or max(1, (os.cpu_count() or 2) - 1)))   # 1 in the container
    pool = [r["sequences"] for r in recs]
    nm = recs[0]["n_machines"]

    def env_factory(rank):
        def _init():
            return make_env(Instance(recs[0]["sequences"], nm), name=c["env"], reward_f=c["reward"], normalize=True, standby=c["standby"], **c["options"],
                            random_instances=c["random_instances"], pool=pool, seed=c["seed"] + rank)
        return _init

    venv = DummyVecEnv([env_factory(i) for i in range(c["n_envs"])])
    eval_envs = [make_env(Instance(r["sequences"], nm), name=c["env"], reward_f=c["reward"], normalize=True,
                          standby=c["standby"], **c["options"]) for r in recs]
    tmp_best = storage.path("agents", f"{job.id}_best.zip")

    nj = recs[0]["n_jobs"]

    def register(aid, steps, best, notes):
        agents.register_trained(aid, {
            "name": c["name"][:60] if steps is None else f"{c['name'][:48]} @ {steps:,}",
            "env": c["env"], **c["options"], "n_jobs": nj, "n_machines": nm, "standby": c["standby"], "normalize": True,
            "reward": c["reward"], "steps": job.timesteps, "gradient": c["gradient"],
            "random_instances": c["random_instances"], "net_arch": c["net_arch"],
            "trained_on": [r["name"] for r in recs], "best_makespan": best,
            "curve": job.evals[-200:], "notes": notes})

    def save_milestone(model):
        """The current agent (not the best checkpoint), saved as its own library agent; training goes on."""
        job.milestone = False
        ms = [_greedy_makespan(model, e) for e in eval_envs]
        mean = round(float(np.mean(ms)), 2) if all(m is not None for m in ms) else None
        aid = storage.new_id("ag")
        os.makedirs(storage.path("agents"), exist_ok=True)
        model.save(agents.zip_file(aid))
        register(aid, job.timesteps, mean, f"milestone at {job.timesteps:,} steps (current agent)")
        job.milestones.append({"agent_id": aid, "steps": job.timesteps, "makespan": mean})
        job.log(f"milestone saved at {job.timesteps:,} steps, greedy makespan {mean}")

    class Progress(BaseCallback):
        def _on_step(self):
            for info in self.locals["infos"]:
                if "makespan" in info:
                    job.episodes.append([self.num_timesteps, info["makespan"], info["lb"]])
            job.timesteps = self.num_timesteps
            if job.milestone:
                save_milestone(self.model)
            return not job.cancel

        def _on_rollout_end(self):
            ms = [_greedy_makespan(self.model, e) for e in eval_envs]
            if all(m is not None for m in ms):
                mean = float(np.mean(ms))
                job.evals.append([self.num_timesteps, round(mean, 2)])
                if job.best is None or mean < job.best:
                    job.best = round(mean, 2)
                    self.model.save(tmp_best)
                    job.log(f"new best greedy makespan {mean:.1f} at {self.num_timesteps:,} steps")

    lr0 = float(c["learning_rate"])
    model = PushMaskablePPO(PushMaskedPolicy, venv, verbose=0, gamma=1.0, gae_lambda=0.95,
                            n_steps=max(16, c["rollout_size"] // c["n_envs"]), batch_size=c["batch_size"],
                            n_epochs=10, learning_rate=lambda progress: lr0 * progress, clip_range=0.2,
                            target_kl=0.02, ent_coef=float(c["ent_coef"]),
                            push_coef=1.0 if c["gradient"] else 0.0, max_ratio=0.1,
                            policy_kwargs=dict(net_arch=dict(pi=list(c["net_arch"]), vf=list(c["net_arch"]))),
                            seed=c["seed"], device="cpu")
    job.status, job.started = "running", time.time()
    if c["env"] == "or_informed":
        _imitate(job, model, pool, nm, eval_envs, tmp_best)
        if job.cancel and not os.path.exists(tmp_best):
            job.status = "cancelled"
            job.log("cancelled before the agent was cloned, no agent saved")
            return
        job.phase = "ppo"
    job.log(f"training {nj}x{nm} net on {len(recs)} instance(s), {c['total_steps']:,} steps, reward {c['reward']}, "
            f"{'random variants' if c['random_instances'] else 'fixed instances'}, "
            f"{'mask gradient' if c['gradient'] else 'plain MaskablePPO'}, env {c['env']} {c['options'] or ''}, standby {c['standby']}")
    model.learn(total_timesteps=c["total_steps"], callback=Progress())

    if job.cancel and not os.path.exists(tmp_best):
        job.status = "cancelled"
        job.log("cancelled before the first evaluation, no agent saved")
        return
    aid = storage.new_id("ag")
    os.makedirs(storage.path("agents"), exist_ok=True)
    if os.path.exists(tmp_best):
        os.replace(tmp_best, agents.zip_file(aid))
    else:
        model.save(agents.zip_file(aid))
    register(aid, None, job.best, "best greedy checkpoint on the training instances")
    job.agent_id = aid
    job.status = "cancelled" if job.cancel else "done"
    job.log(f"saved agent '{c['name']}' ({'stopped early, ' if job.cancel else ''}best {job.best})")
