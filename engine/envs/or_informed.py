"""OR-informed: the dispatching net (same observation, actions and rewards as BasicEnv, wait action always on),
trained in three steps: a metaheuristic solves the training instances, the agent clones its decisions,
then PPO fine-tunes (engine/policies/imitation.py, studio/services/training_jobs.py)."""
from engine.envs.basic import BasicEnv


class OrInformedEnv(BasicEnv):
    name = "or_informed"
    title = "OR-informed"
    description = ("Dispatching with the wait action, trained in three steps: tabu search solves the training "
                   "instances, the agent clones its decisions (waits included), then PPO fine-tunes.")
    forced_standby = "on"                 # the expert's schedules use the wait action
    options = {
        "demos": {"label": "Expert instances (with random variants)", "default": 20, "min": 1, "max": 500},
        "expert_evals": {"label": "Expert search (evaluations)", "default": 20_000, "min": 1_000, "max": 200_000},
        "bc_epochs": {"label": "Cloning epochs", "default": 30, "min": 1, "max": 500},
    }

    def __init__(self, instance, reward_f="L", standby="on", normalize=True, random_instances=False, pool=None,
                 seed=None, demos=20, expert_evals=20_000, bc_epochs=30):
        super().__init__(instance, reward_f=reward_f, standby="on", normalize=normalize,
                         random_instances=random_instances, pool=pool, seed=seed)
