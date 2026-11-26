import numpy as np
import pytest

from engine.envs import HyperHeuristicEnv, make_env
from engine.policies import HEURISTICS, choose, make_rng


def run(env, pick):
    env.reset()
    done = False
    while not done:
        _, _, terminated, truncated, info = env.step(pick(env))
        done = terminated or truncated
    return terminated, info


@pytest.mark.parametrize("k", [1, 3, 5])
def test_macro_steps_dispatch_k_decisions(ft06, k):
    env = make_env(ft06, name="hyper", commitment_length=k)
    dispatched, steps = [], []
    env.on_dispatch = dispatched.append
    rng = np.random.default_rng(0)
    terminated, _ = run(env, lambda e: steps.append(1) or int(rng.choice(np.flatnonzero(e.action_masks()))))
    assert terminated and len(dispatched) == 36 and len(steps) == -(-36 // k)
    assert env.action_space.n == len(HEURISTICS) == 14


@pytest.mark.parametrize("h", range(14))
def test_one_heuristic_always_equals_its_rule(ft06, h):
    """Choosing the same heuristic at every step of the hyper env = running that rule in the dispatching env."""
    _, hh = run(make_env(ft06, name="hyper", commitment_length=4), lambda e: h)
    rng = make_rng(0)
    _, rule = run(make_env(ft06), lambda e: choose(HEURISTICS[h].label, e.sim, e.sim.mask, rng))
    assert hh["makespan"] == rule["makespan"]


def test_no_wait_action_and_size_from_spaces(ft06):
    with pytest.raises(ValueError):
        make_env(ft06, name="hyper", standby="on")
    assert HyperHeuristicEnv.size_from_spaces(HyperHeuristicEnv.obs_dim(15, 15), 14) == (15, 15, False)
    assert HyperHeuristicEnv.size_from_spaces(1487, 15) is None
