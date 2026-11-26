"""Dispatching rules as baselines: one heuristic (engine/policies/heuristics.py) runs the whole episode.
RANDOM picks uniformly among the enabled jobs."""
import numpy as np

from engine.policies.heuristics import HEURISTICS

RULES = {h.label: {"description": h.description} for h in HEURISTICS}
RULES["RANDOM"] = {"description": "uniform random choice among the enabled jobs"}
_BY_LABEL = {h.label: h for h in HEURISTICS}


def choose(name, sim, mask, rng):
    """Index of the action to fire (sim.mask must be the current guard mask, as after env.step / reset)."""
    if name not in RULES:
        raise ValueError(f"unknown rule {name}")
    enabled = [i for i, m in enumerate(mask) if m and i != sim.standby_index]
    if not enabled:
        return sim.standby_index if sim.standby_index is not None else 0
    if name == "RANDOM":
        return int(rng.choice(enabled))
    return _BY_LABEL[name].decide(sim)


def make_rng(seed=0):
    return np.random.default_rng(seed)
