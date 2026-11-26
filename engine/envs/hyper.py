"""Hyper-heuristic env (from PetriRL envs/shu): one action selects a low-level heuristic, which makes the next
`commitment_length` dispatching decisions (one macro step) among the actions enabled by the guard function."""
import numpy as np
from gymnasium import spaces

from engine.core import standby_mode
from engine.envs.basic import BasicEnv
from engine.policies.heuristics import HEURISTICS


class HyperHeuristicEnv(BasicEnv):
    name = "hyper"
    title = "Hyper-heuristic"
    description = "One action picks one of 14 dispatching rules, which then makes the next k decisions."
    problem_types = ("jssp",)
    supports_standby = False
    fixed_actions = len(HEURISTICS)
    options = {"commitment_length": {"label": "Decisions per action (k)", "default": 5, "min": 1, "max": 50}}

    def __init__(self, instance, reward_f="L", standby="off", normalize=True, random_instances=False,
                 pool=None, seed=None, commitment_length=5):
        if standby_mode(standby) != "off":
            raise ValueError("the hyper-heuristic env has no wait action")
        self.heuristics = HEURISTICS
        self.commitment_length = int(commitment_length)
        self.on_dispatch = None                 # callback(action index) before each low-level dispatch (replay)
        super().__init__(instance, reward_f=reward_f, standby="off", normalize=normalize,
                         random_instances=random_instances, pool=pool, seed=seed)
        self.action_space = spaces.Discrete(len(self.heuristics))

    def action_masks(self):
        """A heuristic is selectable if it can propose an action enabled by the guard function."""
        return np.array([h.decide(self.sim) is not None for h in self.heuristics], dtype=np.bool_)

    def action_keys(self):
        return [h.label for h in self.heuristics]

    def act(self, action):
        sim, heuristic = self.sim, self.heuristics[int(action)]
        for _ in range(self.commitment_length):
            if sim.is_terminal():
                break
            move = heuristic.decide(sim)                # uses sim.mask, refreshed below
            if move is None:
                sim.interaction_counter += 1            # keeps the truncation counter moving
            else:
                if self.on_dispatch:
                    self.on_dispatch(move)
                sim.fire_controlled(sim.action_map[move])
            while not sim.real_action_available():      # also refreshes sim.mask
                sim.time_tick()
                sim.fire_timed()
                if sim.is_terminal():
                    break

    @staticmethod
    def size_from_spaces(n_obs, n_actions):
        """(n_jobs, n_machines, standby): the action space is the heuristics, so the size comes from the
        observation only (32 + 34 n_jobs + 63 n_machines); None if it does not match or is ambiguous."""
        if n_actions != len(HEURISTICS):
            return None
        sizes = [(nj, (n_obs - 32 - 34 * nj) // 63) for nj in range(2, 201)
                 if n_obs - 32 - 34 * nj > 0 and (n_obs - 32 - 34 * nj) % 63 == 0]
        return (*sizes[0], False) if len(sizes) == 1 else None
