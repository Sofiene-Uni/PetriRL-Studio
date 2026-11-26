import numpy as np
import pytest

from engine.core import standby_mode
from engine.envs import make_env


def run_random(inst, mode, seed=1):
    env = make_env(inst, standby=mode)
    env.reset()
    rng, done, offered, waits = np.random.default_rng(seed), False, 0, 0
    while not done:
        mask = env.action_masks()
        if env.sim.standby_index is not None:
            offered += int(mask[env.sim.standby_index])
            assert not mask[env.sim.standby_index] or env.sim.operation_running()   # never wait on an idle shop
        a = int(rng.choice(np.flatnonzero(mask)))
        waits += a == env.sim.standby_index
        _, _, terminated, truncated, info = env.step(a)
        done = terminated or truncated
    return env, terminated, offered, waits


@pytest.mark.parametrize("mode,actions", [("off", 6), ("on", 7), ("gt", 7)])
def test_action_space_and_episode_ends(ft06, mode, actions):
    env, terminated, _, _ = run_random(ft06, mode)
    assert env.action_space.n == actions and terminated
    assert len(env.sim.schedule()) == 36


def test_gt_offers_waiting_less_often(ft06):
    on = sum(run_random(ft06, "on", s)[2] for s in range(5))
    gt = sum(run_random(ft06, "gt", s)[2] for s in range(5))
    assert 0 < gt < on


def test_standby_mode_values():
    assert (standby_mode(None), standby_mode(False), standby_mode(True), standby_mode("gt")) == ("off", "off", "on", "gt")
    with pytest.raises(ValueError):
        standby_mode("sometimes")
