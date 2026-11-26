import pytest

from engine.envs import BasicEnv, make_env
from engine.policies import RULES, choose, make_rng


def run_rule(inst, name):
    env = make_env(inst)
    env.reset()
    rng, done = make_rng(0), False
    while not done:
        _, _, terminated, truncated, info = env.step(choose(name, env.sim, env.sim.mask, rng))
        done = terminated or truncated
    return env, terminated, info


@pytest.mark.parametrize("rule", list(RULES))
def test_rules_give_a_feasible_schedule(ft06, rule):
    env, terminated, info = run_rule(ft06, rule)
    assert terminated
    plan = env.sim.schedule()
    assert len(plan) == 36
    assert info["makespan"] == max(o["end"] for o in plan) >= info["lb"] == 47
    for m in range(1, 7):                                   # no overlap on a machine
        ops = sorted((o for o in plan if o["machine"] == m), key=lambda o: o["start"])
        assert all(a["end"] <= b["start"] for a, b in zip(ops, ops[1:]))
    for j in range(1, 7):                                   # job order respected
        ops = sorted((o for o in plan if o["job"] == j), key=lambda o: o["rank"])
        assert all(a["end"] <= b["start"] for a, b in zip(ops, ops[1:]))
        assert [o["machine"] for o in ops] == [m for m, _, _ in ft06.base_sequences[j - 1]]


def test_known_makespan_is_stable(ft06):
    assert run_rule(ft06, "LPSR")[2]["makespan"] == 61       # most operations remaining


def test_observation_size(ft06):
    env = make_env(ft06)
    assert env.observation_space.shape[0] == BasicEnv.obs_dim(6, 6)
    assert BasicEnv.size_from_spaces(BasicEnv.obs_dim(15, 10), 15) == (15, 10, False)

