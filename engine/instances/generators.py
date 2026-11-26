"""Instance generators."""
import numpy as np


def random_instance(n_jobs, n_machines, p_min=1, p_max=99, seed=None):
    """Taillard-like random instance: every job visits every machine once, in random order."""
    rng = np.random.default_rng(seed)
    return [[(int(m) + 1, 0, int(rng.integers(p_min, p_max + 1))) for m in rng.permutation(n_machines)]
            for _ in range(n_jobs)]
