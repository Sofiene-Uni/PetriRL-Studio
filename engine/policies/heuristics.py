"""Job-selection dispatching rules (from PetriRL envs/shu/heuristics.py).

Used two ways: as baselines (one rule runs the whole episode) and as the low-level heuristics the
hyper-heuristic agent chooses from. Each rule scores the enabled job_select actions (sim.mask, the Petri net
guard function) and returns the action index with the best score, so it never proposes an infeasible action.
Ties go to the lowest action index: every rule is a deterministic mapping.

New rule: subclass JobRule (label, description, score, maximize) and add it to HEURISTICS.
"""


class JobRule:
    label = ""
    description = ""
    maximize = False

    def score(self, sim, job, action):
        raise NotImplementedError

    def decide(self, sim):
        best, best_value = None, None
        for action, enabled in enumerate(sim.mask):
            transition = sim.action_map[action]
            if not enabled or transition.role != "job_select":
                continue
            job = transition.non_flag_parents[0]
            if not job.token_container:
                continue
            value = self.score(sim, job, action)
            if best is None or (value > best_value if self.maximize else value < best_value):
                best, best_value = action, value
        return best

    def __str__(self):
        return self.label


# ---- index based ----------------------------------------------------------------------
class Fifo(JobRule):
    label, description = "FIFO", "lowest job number (all jobs arrive at t = 0)"
    def score(self, sim, job, action): return action


class Lifo(Fifo):
    label, description, maximize = "LIFO", "highest job number", True


# ---- static: the whole job, fixed at t = 0 ----------------------------------------------
class Spt(JobRule):
    label, description = "SPT", "shortest total processing time of the job"
    def score(self, sim, job, action): return sum(p for _, _, p in sim.instance.job_sequences[job.color - 1])


class Lpt(Spt):
    label, description, maximize = "LPT", "longest total processing time of the job", True


class Sps(JobRule):
    label, description = "SPS", "fewest operations in the job"
    def score(self, sim, job, action): return len(sim.instance.job_sequences[job.color - 1])


class Lps(Sps):
    label, description, maximize = "LPS", "most operations in the job", True


# ---- dynamic: the remaining operations of the job ---------------------------------------
class Ltwr(JobRule):
    label, description = "LTWR", "least total work remaining"
    def score(self, sim, job, action): return sum(t.time_features[0] for t in job.token_container)


class Mtwr(Ltwr):
    label, description, maximize = "MTWR", "most total work remaining", True


class Spsr(JobRule):
    label, description = "SPSR", "fewest operations remaining"
    def score(self, sim, job, action): return len(job.token_container)


class Lpsr(Spsr):
    label, description, maximize = "LPSR", "most operations remaining", True


class Sptn(JobRule):
    label, description = "SPTN", "shortest processing time of the next operation"
    def score(self, sim, job, action): return job.token_container[0].time_features[0]


class Lptn(Sptn):
    label, description, maximize = "LPTN", "longest processing time of the next operation", True


class Swt(JobRule):
    label, description = "SWT", "shortest waiting time since the job's last operation finished"
    def score(self, sim, job, action): return sim.clock - sim.job_free.get(job.color, 0)


class Lwt(Swt):
    label, description, maximize = "LWT", "longest waiting time since the job's last operation finished", True


HEURISTICS = [Fifo(), Lifo(), Spt(), Lpt(), Sps(), Lps(), Ltwr(), Mtwr(), Spsr(), Lpsr(), Sptn(), Lptn(), Swt(), Lwt()]
BY_LABEL = {h.label: h for h in HEURISTICS}
