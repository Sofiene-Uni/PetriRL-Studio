"""Agent library: stock agents, agents trained in the app, uploaded agents, dispatching rules and metaheuristics."""
import os
import shutil
import sys
import threading

from engine.core import standby_mode
from engine.envs import DEFAULT_ENV, ENVS, get_env_class
from engine.policies import METAHEURISTICS, RULES
from studio.services import storage

FOLDER = "agents"
SOURCE_ORDER = {"stock": 0, "trained": 1, "uploaded": 2}
_cache, _cache_lock = {}, threading.Lock()


def _register_policy_module():
    """Agents saved by PetriRL reference the module "mask_gradient"; make that name importable."""
    from engine.policies import mask_gradient
    sys.modules.setdefault("mask_gradient", mask_gradient)


def _meta_file(aid):
    return storage.path(FOLDER, f"{storage.slug(aid)}.json")


def zip_file(aid):
    return storage.path(FOLDER, f"{storage.slug(aid)}.zip")


BUILT_IN = ("rule", "meta", "solution")   # kinds without a model; they cannot be changed or deleted


def rule_agents():
    rules = [{"id": f"rule:{name}", "name": name, "kind": "rule", "source": "rule", "env": DEFAULT_ENV,
              "description": r["description"]} for name, r in RULES.items()]
    metas = [{"id": f"meta:{key}", "name": m["name"], "key": key, "kind": "meta", "source": "meta", "env": DEFAULT_ENV,
              "description": m["description"],
              "params": [{"key": k, "label": p[0], "default": p[1], "min": p[2], "max": p[3], "step": p[4],
                          "type": "bool" if isinstance(p[1], bool) else "number"} for k, p in m["params"].items()]} for key, m in METAHEURISTICS.items()]
    known = [{"id": "solution:known", "name": "Best known solution", "kind": "solution", "source": "solution",
              "env": DEFAULT_ENV, "description": "replays the stored best known solution of the instance "
                                                  "(Taillard: optimizizer.com, O. Shylo)"}]
    return rules + metas + known


def seed_stock():
    folder = storage.stock(FOLDER)
    if not os.path.isdir(folder):
        return
    for fname in os.listdir(folder):
        if fname.endswith(".json"):
            aid = fname[:-5]
            if not os.path.exists(_meta_file(aid)):
                shutil.copy(os.path.join(folder, fname), _meta_file(aid))
                shutil.copy(os.path.join(folder, aid + ".zip"), zip_file(aid))


def list_all():
    learned = sorted(storage.list_json(FOLDER), key=lambda a: (SOURCE_ORDER.get(a["source"], 9), a["created"]))
    return learned + rule_agents()


def get(aid):
    if aid.startswith(("rule:", "meta:", "solution:")):
        found = [a for a in rule_agents() if a["id"] == aid]
        if not found:
            raise KeyError(f"unknown rule or metaheuristic {aid}")
        return found[0]
    if not os.path.exists(_meta_file(aid)):
        raise KeyError(f"agent {aid} not found")
    return storage.read_json(_meta_file(aid))


def compatible(agent, inst_rec):
    """Same problem type as the agent's net; rules and metaheuristics solve any size, a learned agent only its own,
    a known solution only the instance it belongs to."""
    env = get_env_class(agent.get("env", DEFAULT_ENV))
    if inst_rec.get("problem_type", "jssp") not in env.problem_types:
        return False
    if agent["kind"] == "solution":
        from studio.services import known_solutions
        return known_solutions.has(inst_rec["id"])
    if agent["kind"] in BUILT_IN:
        return True
    return agent["n_jobs"] == inst_rec["n_jobs"] and agent["n_machines"] == inst_rec["n_machines"]


# Training-only settings saved as functions: they do not load across Python versions and are not needed to act.
INFERENCE_OBJECTS = {"learning_rate": 0.0, "lr_schedule": lambda _: 0.0, "clip_range": lambda _: 0.2}


def load_model(aid):
    from sb3_contrib import MaskablePPO
    _register_policy_module()
    with _cache_lock:
        if aid not in _cache:
            _cache[aid] = MaskablePPO.load(zip_file(aid), device="cpu", custom_objects=INFERENCE_OBJECTS)
            if len(_cache) > 8:
                _cache.pop(next(iter(_cache)))
        return _cache[aid]


def save_meta(meta):
    storage.write_json(_meta_file(meta["id"]), meta)
    return meta


def register_trained(aid, meta):
    env = meta.get("env", DEFAULT_ENV)
    meta = {"id": aid, "kind": "ppo", "source": "trained", "created": storage.now(), "env": env, **meta}
    meta["obs_dim"] = get_env_class(env).obs_dim(meta["n_jobs"], meta["n_machines"])
    return save_meta(meta)


def upload(file_storage, name=None, env=None):
    """Uploaded MaskablePPO .zip (from PetriRL train.py or this app). The net size is read from its spaces."""
    from sb3_contrib import MaskablePPO
    _register_policy_module()
    aid = storage.new_id("ag")
    file_storage.save(zip_file(aid))
    try:
        model = MaskablePPO.load(zip_file(aid), device="cpu", custom_objects=INFERENCE_OBJECTS)
    except Exception as e:  # noqa: BLE001  (any load error is reported to the user)
        os.remove(zip_file(aid))
        raise ValueError(f"not a MaskablePPO agent: {e}") from e
    n_obs, n_act = int(model.observation_space.shape[0]), int(model.action_space.n)
    candidates = [env] if env else list(ENVS)
    match = next(((e, size) for e in candidates if (size := get_env_class(e).size_from_spaces(n_obs, n_act))), None)
    if match is None:
        os.remove(zip_file(aid))
        raise ValueError(f"an agent with {n_obs} observations and {n_act} actions does not fit "
                         f"{'the ' + env + ' env' if env else 'any env (' + ', '.join(ENVS) + ')'}")
    env, (nj, nm, standby) = match
    base = os.path.splitext(file_storage.filename or "agent")[0]
    meta = {"id": aid, "name": (name or base)[:60], "kind": "ppo", "source": "uploaded", "created": storage.now(),
            "env": env, **{k: s["default"] for k, s in get_env_class(env).options.items()},
            "n_jobs": nj, "n_machines": nm, "standby": "on" if standby else "off", "obs_dim": n_obs, "normalize": True,
            "reward": None, "steps": int(getattr(model, "num_timesteps", 0)), "trained_on": [],
            "notes": "uploaded agent (assumes normalize=True, as in PetriRL train.py)"
                     + ("; has a standby action, run with standby 'on' (change it to 'gt' if trained so)" if standby else "")}
    with _cache_lock:
        _cache[aid] = model
    return save_meta(meta)


def update(aid, name=None, standby=None):
    """Rename, or switch the standby mask between "on" and "gt" (same action space, the agent is unchanged)."""
    meta = get(aid)
    if meta["kind"] in BUILT_IN or meta["source"] == "stock":
        raise PermissionError("stock agents, rules and metaheuristics cannot be changed")
    if name:
        meta["name"] = name[:60]
    if standby is not None:
        new = standby_mode(standby)
        if (new == "off") != (standby_mode(meta.get("standby")) == "off"):
            raise ValueError("the standby action is part of the agent: only 'on' <-> 'gt' can be switched")
        meta["standby"] = new
    return save_meta(meta)


def delete(aid):
    meta = get(aid)
    if meta["kind"] in BUILT_IN or meta["source"] == "stock":
        raise PermissionError("stock agents, rules and metaheuristics cannot be deleted")
    os.remove(_meta_file(aid))
    if os.path.exists(zip_file(aid)):
        os.remove(zip_file(aid))
    with _cache_lock:
        _cache.pop(aid, None)
