import numpy as np
import pytest

from engine.envs import make_env
from engine.policies import METAHEURISTICS, priority_choice, search, turn_choice
from engine.policies.metaheuristics import _random_seq, decode, decode_wait


def run_priority(inst, seq, wait=False):
    jobs = [[(m, p) for m, _, p in job] for job in inst.job_sequences]
    env = make_env(inst, standby="on" if wait else "off")
    env.reset()
    choose, done = (turn_choice(seq, jobs) if wait else priority_choice(seq, inst.n_jobs)), False
    while not done:
        _, _, terminated, truncated, _ = env.step(choose(env.sim, env.sim.mask))
        done = terminated or truncated
    return env.sim.clock


def test_decoder_matches_the_petri_net(ft06):
    """The search decoder must give the makespan of the net for any job priority."""
    jobs = [[(m, p) for m, _, p in job] for job in ft06.job_sequences]
    rng = np.random.default_rng(3)
    for _ in range(10):
        seq = _random_seq(jobs, rng)
        assert decode(jobs, seq) == run_priority(ft06, seq)
        assert decode_wait(jobs, seq) == run_priority(ft06, seq, wait=True)


@pytest.mark.parametrize("wait", [False, True])
@pytest.mark.parametrize("name", list(METAHEURISTICS))
def test_metaheuristics_beat_a_random_sequence(ft06, name, wait):
    seq, makespan = search(name, ft06.job_sequences, seed=0, params={"evals": 400, "wait": wait})
    jobs = [[(m, p) for m, _, p in job] for job in ft06.job_sequences]
    dec = decode_wait if wait else decode
    assert makespan == dec(jobs, seq) == run_priority(ft06, seq, wait)
    assert 55 <= makespan <= dec(jobs, _random_seq(jobs, np.random.default_rng(0)))


def test_settings_are_clipped():
    from engine.policies.metaheuristics import settings
    assert settings("GA", {"population": 1, "evals": 10**9, "mutation": 2}) == {
        "wait": True, "evals": 500_000, "population": 4, "mutation": 1.0, "tournament": 3, "elites": 2}
