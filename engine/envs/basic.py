"""Gymnasium environment for JSSP on the Petri net simulator (adapted from PetriRL BasicEnv)."""
import numpy as np
from gymnasium import Env, spaces

from engine.features.bounds import lower_bound
from engine.core.simulator import Simulator


class BasicEnv(Env):
    """Basic JSSP net: jobs and machines, no transport. standby: "off" | "on" | "gt" (engine.core.STANDBY_MODES).
    reward_f: "G" (-elapsed time, episode sum = -makespan) or "L" (LB(s_t) - LB(s_t+1)).
    Both are divided by the makespan lower bound when normalize=True. Train with gamma = 1."""

    name = "basic"
    title = "Dispatching"
    description = "One action releases one job onto its next machine (optionally: wait)."
    problem_types = ("jssp",)
    options = {}                          # extra constructor settings, shown in the Train form
    supports_standby = True
    fixed_actions = None                  # None: one action per job (+ wait)
    metadata = {"render_modes": []}

    def __init__(self, instance, reward_f="L", standby="off", normalize=True, random_instances=False,
                 pool=None, seed=None):
        if reward_f not in ("G", "L"):
            raise ValueError("reward_f must be 'G' or 'L'")
        self.reward_f = reward_f
        self.sim = Simulator(instance, standby=standby, normalize=normalize,
                             random_instances=random_instances, pool=pool, seed=seed)
        self.observation_space = spaces.Box(low=-np.inf, high=np.inf,
                                            shape=(len(self.sim.get_state()),), dtype=np.float32)
        self.action_space = spaces.Discrete(len(self.sim.action_map))
        self.last_clock, self.last_lb = 0, 0

    def reset(self, seed=None, options=None):
        super().reset(seed=seed)
        if seed is not None:
            self.sim.rng = np.random.default_rng(seed)
        self.sim.petri_reset()
        self.sim.guard_function()
        self.last_clock, self.last_lb = 0, lower_bound(self.sim)
        return self.sim.get_state(), {}

    def action_masks(self):
        return np.array(self.sim.mask, dtype=np.bool_)

    def act(self, action):
        """Applies one agent action and advances time to the next decision."""
        self.sim.interact(action)

    def action_keys(self):
        """Stable name of each action (job number, or "wait"), used by the replay and the policy view."""
        return [str(t.color) if t.role == "job_select" else "wait" for t in self.sim.action_map.values()]

    def step(self, action):
        self.act(action)
        obs = self.sim.get_state()
        terminated = self.sim.is_terminal()
        if self.reward_f == "G":
            reward = -(self.sim.clock - self.last_clock)
        else:
            lb = lower_bound(self.sim)
            reward, self.last_lb = self.last_lb - lb, lb
        self.last_clock = self.sim.clock
        reward /= self.sim.reward_scale
        truncated = self.sim.interaction_counter > 10 * self.sim.number_of_ops
        info = {"makespan": self.sim.clock, "lb": self.sim.instance.scales["lb"]} if terminated else {}
        return obs, float(reward), terminated, truncated, info


    # ------------------------------------------------------------- size of the net <-> spaces
    @staticmethod
    def obs_dim(n_jobs, n_machines):
        """Length of the observation: 15 features per place + look-ahead (see engine/features/observation.py)."""
        n_places = 2 + 2 * n_jobs + 4 * n_machines
        return 15 * n_places + 4 * n_jobs + 3 * n_machines + 2

    @staticmethod
    def size_from_spaces(n_obs, n_actions):
        """(n_jobs, n_machines, standby) of the net an agent was trained on, from its spaces; None if no match."""
        for standby in (False, True):
            nj = n_actions - int(standby)
            rest = n_obs - 32 - 34 * nj
            if nj > 0 and rest > 0 and rest % 63 == 0:
                return int(nj), int(rest // 63), standby
        return None
