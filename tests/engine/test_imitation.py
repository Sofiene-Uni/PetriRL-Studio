import numpy as np

from engine.envs import make_env
from engine.policies.imitation import behavior_clone, demonstrations


def test_expert_demonstrations_replay_on_the_net(ft06):
    d = demonstrations(ft06, evals=2000)
    assert d["makespan"] >= 55 and d["waits"] > 0
    assert len(d["obs"]) == len(d["masks"]) == len(d["targets"]) == len(d["returns"])
    for mask, target in zip(d["masks"], d["targets"]):
        assert target and all(mask[a] for a in target)          # every correct action is allowed by the net


def test_cloned_policy_follows_the_expert(ft06):
    from sb3_contrib import MaskablePPO
    env = make_env(ft06, standby="on")
    model = MaskablePPO("MlpPolicy", env, seed=0, device="cpu", policy_kwargs={"net_arch": [256, 256]})
    demos = [demonstrations(ft06, evals=20_000, seed=s) for s in range(5)]
    assert behavior_clone(model.policy, demos, epochs=60) > 0.95
    obs, _ = env.reset()
    done = False
    while not done:
        action = int(model.predict(obs, action_masks=env.action_masks(), deterministic=True)[0])
        obs, _, terminated, truncated, _ = env.step(action)
        done = terminated or truncated
    assert terminated and env.sim.clock <= 1.1 * max(d["makespan"] for d in demos)
