"""JSSP instance data and its scales.

Internal format: one list per job of operations (machine, tool, process_time),
machines numbered 1..n_machines (the Petri net routes tokens by these numbers).
"""


class InstanceError(ValueError):
    pass


class Instance:
    def __init__(self, sequences, n_machines=None, name="instance"):
        if not sequences or not all(sequences):
            raise InstanceError("the instance has no operations")
        self.name = name
        self.base_sequences = [[tuple(int(v) for v in op) for op in job] for job in sequences]
        self.n_jobs = len(self.base_sequences)
        used = max(m for job in self.base_sequences for m, _, _ in job)
        self.n_machines = int(n_machines or used)
        self.n_tools = max(t for job in self.base_sequences for _, t, _ in job)
        self.max_ops = max(len(job) for job in self.base_sequences)
        self.check()
        self.set_sequences(self.base_sequences)

    @property
    def specs(self):
        return self.n_jobs, self.n_machines, self.n_tools, self.max_bound, self.max_ops

    def check(self):
        for j, job in enumerate(self.base_sequences, start=1):
            for m, _, p in job:
                if not 1 <= m <= self.n_machines:
                    raise InstanceError(f"job {j} uses machine {m}, machines must be 1..{self.n_machines}")
                if p <= 0:
                    raise InstanceError(f"job {j} has a process time {p} (must be > 0)")

    def set_sequences(self, sequences):
        self.job_sequences = [list(job) for job in sequences]
        self.max_bound = max(p for job in self.job_sequences for _, _, p in job)
        self.scales = compute_scales(self.job_sequences)

    def sample_like(self, rng, base=None):
        """Random instance of the same size and statistics: every job keeps its number of operations
        and its set of machines (new random order), process times uniform in [p_min, p_max]."""
        base = base or self.base_sequences
        times = [p for job in base for _, _, p in job]
        p_min, p_max = min(times), max(times)
        new = []
        for job in base:
            order = rng.permutation(len(job))
            new.append([(int(job[k][0]), int(job[i][1]), int(rng.integers(p_min, p_max + 1)))
                        for i, k in enumerate(order)])
        self.set_sequences(new)

    def summary(self):
        ops = sum(len(j) for j in self.base_sequences)
        times = [p for job in self.base_sequences for _, _, p in job]
        return {"n_jobs": self.n_jobs, "n_machines": self.n_machines, "n_ops": ops,
                "lb": compute_scales(self.base_sequences)["lb"],
                "p_min": min(times), "p_max": max(times), "total_work": sum(times)}


def compute_scales(sequences):
    """max_p: largest process time, lb: makespan lower bound max(longest job, busiest machine)."""
    ops = [op for job in sequences for op in job]
    max_p = max(p for _, _, p in ops)
    job_lb = max(sum(p for _, _, p in job) for job in sequences)
    load = {}
    for m, _, p in ops:
        load[m] = load.get(m, 0) + p
    lb = max(job_lb, max(load.values()))
    return {"max_p": max(int(max_p), 1), "lb": max(int(lb), 1), "n_ops": len(ops)}
