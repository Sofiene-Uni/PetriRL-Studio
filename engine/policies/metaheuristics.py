"""Metaheuristics: search an operation sequence, then dispatch with it on the Petri net.

A solution is an operation sequence (permutation with repetition): job j appears once per operation and its k-th
occurrence is its k-th operation. It is read in one of two ways, each with a fast decoder for the search and a
chooser that replays it on the net with the same makespan:

- without wait (`decode`, `priority_choice`): the sequence is a priority. At every decision all free jobs are
  released, best priority first; machines serve their queue first come, first served.
- with wait (`decode_wait`, `turn_choice`): the sequence is the order of the operations on each machine. A job is
  released only when it is its turn on its machine, otherwise the agent waits. Any machine order can be built
  this way, so the optimum is in the search space (semi-active schedules).

Each method is deterministic for a seed and stops at its evaluation budget (one evaluation = one schedule built).
MAX_SECONDS is only a safety stop for very large budgets.
"""
import math
import time

import numpy as np

MAX_SECONDS = 600.0


def decode(jobs, seq):
    """Makespan of the dispatching env's schedule for the operation sequence seq (jobs: [[(machine, time), ...]]).

    Same semantics as the net: at each event time every idle job is released, best priority first, into the
    queue of its next machine; a free machine starts the first job of its queue (first come, first served)."""
    n = len(jobs)
    prio = [[0] * len(job) for job in jobs]
    count = [0] * n
    for pos, j in enumerate(seq):
        prio[j][count[j]] = pos
        count[j] += 1
    nxt = [0] * n                       # next operation of each job
    idle = [True] * n                   # job waits for its next release (not queued, not processing)
    queue = {}                          # machine -> jobs waiting, in arrival order
    busy = {}                           # machine -> (end, job)
    left = sum(len(job) for job in jobs)
    t = 0
    while True:
        for m, (end, j) in list(busy.items()):          # operations finishing now
            if end == t:
                del busy[m]
                nxt[j] += 1
                idle[j] = nxt[j] < len(jobs[j])
                left -= 1
        if not left:
            return t

        def start_free():
            for m, q in queue.items():
                if q and m not in busy:
                    j = q.pop(0)
                    busy[m] = (t + jobs[j][nxt[j]][1], j)
        start_free()
        for j in sorted((j for j in range(n) if idle[j]), key=lambda j: prio[j][nxt[j]]):
            idle[j] = False
            queue.setdefault(jobs[j][nxt[j]][0], []).append(j)
            start_free()
        t = min(end for end, _ in busy.values())


def decode_wait(jobs, seq):
    """Makespan with the wait action: each operation starts when its job and its machine (previous operation on
    that machine in the sequence) are both done."""
    nxt = [0] * len(jobs)
    job_end, mach_end = [0] * len(jobs), {}
    for j in seq:
        m, p = jobs[j][nxt[j]]
        end = max(job_end[j], mach_end.get(m, 0)) + p
        job_end[j] = mach_end[m] = end
        nxt[j] += 1
    return max(job_end)


def turn_choice(seq, jobs):
    """Rule for the env with the wait action: choose(sim, mask) releases an enabled job whose next operation is
    next on its machine (the earliest in the sequence), and waits when none is."""
    order, count = {}, [0] * len(jobs)           # machine -> [(job, op), ...] in sequence order
    for j in seq:
        order.setdefault(jobs[j][count[j]][0], []).append((j, count[j]))
        count[j] += 1
    rank, count = {}, [0] * len(jobs)           # (job, op) -> position in the sequence
    for i, j in enumerate(seq):
        rank[(j, count[j])] = i
        count[j] += 1
    released, turn = [0] * len(jobs), {m: 0 for m in order}

    def choose(sim, mask):
        best, best_r = None, None
        for action, on in enumerate(mask):
            tr = sim.action_map[action]
            if not on or tr.role != "job_select":
                continue
            j = tr.color - 1
            k = released[j]
            m = jobs[j][k][0]
            if order[m][turn[m]] == (j, k) and (best_r is None or rank[(j, k)] < best_r):
                best, best_r = action, rank[(j, k)]
        if best is None:
            return sim.standby_index
        j = sim.action_map[best].color - 1
        turn[jobs[j][released[j]][0]] += 1
        released[j] += 1
        return best
    return choose


def priority_choice(seq, n_jobs):
    """Rule for the env: choose(sim, mask) releases the enabled job with the best priority (job colors are 1-based)."""
    prio = [[] for _ in range(n_jobs)]
    for pos, j in enumerate(seq):
        prio[j].append(pos)
    released = [0] * n_jobs

    def choose(sim, mask):
        best, best_p = None, None
        for action, on in enumerate(mask):
            tr = sim.action_map[action]
            if not on or tr.role != "job_select":
                continue
            j = tr.color - 1
            p = prio[j][released[j]]
            if best_p is None or p < best_p:
                best, best_p = action, p
        released[sim.action_map[best].color - 1] += 1
        return best
    return choose


# ---------------------------------------------------------------------------------------------- search moves
def _random_seq(jobs, rng):
    seq = np.repeat(np.arange(len(jobs)), [len(job) for job in jobs])
    rng.shuffle(seq)
    return seq.tolist()


def _swap(seq, rng):
    s = list(seq)
    a, b = rng.integers(len(s), size=2)
    s[a], s[b] = s[b], s[a]
    return s, (min(a, b), max(a, b))


def _insert(seq, rng):
    s = list(seq)
    a, b = rng.integers(len(s), size=2)
    s.insert(b, s.pop(a))
    return s


def _pox(p1, p2, n_jobs, rng):
    """Precedence-preserving order crossover: jobs of a random set keep their positions from p1, the rest
    fill the other positions in p2's order."""
    keep = set(rng.choice(n_jobs, size=max(1, n_jobs // 2), replace=False).tolist())
    rest = iter([j for j in p2 if j not in keep])
    return [j if j in keep else next(rest) for j in p1]


class _Budget:
    def __init__(self, evals, progress=None):
        self.evals, self.used, self.t0, self.progress = evals, 0, time.perf_counter(), progress

    def left(self):
        if self.progress:
            self.progress(min(self.used, self.evals), self.evals)
        return self.used < self.evals and time.perf_counter() - self.t0 < MAX_SECONDS


# ------------------------------------------------------------------------------------------------- methods
def genetic(jobs, rng, evals, progress=None, wait=True, population=40, mutation=0.3, tournament=3, elites=2):
    """Genetic algorithm: tournament selection, POX crossover, swap mutation, the best `elites` kept."""
    budget, size = _Budget(evals, progress), population
    dec = decode_wait if wait else decode
    pop = [_random_seq(jobs, rng) for _ in range(size)]
    fit = [dec(jobs, s) for s in pop]
    budget.used += size
    while budget.left():
        order = np.argsort(fit)
        new, new_fit = [pop[i] for i in order[:elites]], [fit[i] for i in order[:elites]]
        while len(new) < size and budget.left():
            pick = lambda: pop[min(rng.integers(size, size=tournament), key=lambda i: fit[i])]
            child = _pox(pick(), pick(), len(jobs), rng)
            if rng.random() < mutation:
                child, _ = _swap(child, rng)
            new.append(child)
            new_fit.append(dec(jobs, child))
            budget.used += 1
        pop, fit = new, new_fit
    i = int(np.argmin(fit))
    return pop[i], fit[i]


def annealing(jobs, rng, evals, progress=None, wait=True, t_start=5.0, t_end=0.1):
    """Simulated annealing: swap or insert moves, geometric cooling from t_start % to t_end % of the start makespan."""
    budget = _Budget(evals, progress)
    dec = decode_wait if wait else decode
    cur = _random_seq(jobs, rng)
    cur_c = dec(jobs, cur)
    best, best_c = cur, cur_c
    t_start, t_end = t_start / 100 * cur_c, min(t_end, t_start) / 100 * cur_c
    while budget.left():
        temp = t_start * (t_end / t_start) ** (budget.used / evals)
        cand = _swap(cur, rng)[0] if rng.random() < 0.5 else _insert(cur, rng)
        c = dec(jobs, cand)
        budget.used += 1
        if c <= cur_c or rng.random() < math.exp((cur_c - c) / temp):
            cur, cur_c = cand, c
            if c < best_c:
                best, best_c = cand, c
    return best, best_c


def tabu(jobs, rng, evals, progress=None, wait=True, neighbors=20, tenure=10):
    """Tabu search: best of `neighbors` random swaps per step, the swapped positions stay tabu for `tenure` steps
    unless the move beats the best makespan (aspiration)."""
    budget = _Budget(evals, progress)
    dec = decode_wait if wait else decode
    cur = _random_seq(jobs, rng)
    best, best_c = cur, dec(jobs, cur)
    tabu_until, step = {}, 0
    while budget.left():
        step += 1
        moves = []
        for _ in range(neighbors):
            cand, move = _swap(cur, rng)
            c = dec(jobs, cand)
            budget.used += 1
            if tabu_until.get(move, 0) < step or c < best_c:
                moves.append((c, cand, move))
        if not moves:
            continue
        c, cur, move = min(moves, key=lambda x: x[0])
        tabu_until[move] = step + tenure
        if c < best_c:
            best, best_c = cur, c
    return best, best_c


# settings shown in the app: name -> (label, default, min, max, step)
EVALS = ("Evaluations (schedules built)", 20_000, 100, 500_000, 1000)
WAIT = ("Use the wait action", True, 0, 1, 1)
METAHEURISTICS = {
    "GA": {"run": genetic, "name": "Genetic algorithm", "description": "crossover and mutation of job priorities",
           "params": {"wait": WAIT, "evals": EVALS, "population": ("Population", 40, 4, 500, 2),
                      "mutation": ("Mutation rate", 0.3, 0.0, 1.0, 0.05), "tournament": ("Tournament size", 3, 2, 10, 1),
                      "elites": ("Elites kept", 2, 0, 20, 1)}},
    "SA": {"run": annealing, "name": "Simulated annealing", "description": "random moves, worse ones accepted less over time",
           "params": {"wait": WAIT, "evals": EVALS, "t_start": ("Start temperature (% of makespan)", 5.0, 0.01, 50.0, 0.5),
                      "t_end": ("End temperature (% of makespan)", 0.1, 0.001, 10.0, 0.05)}},
    "TS": {"run": tabu, "name": "Tabu search", "description": "best neighbor each step, recent moves forbidden",
           "params": {"wait": WAIT, "evals": EVALS, "neighbors": ("Neighbors per step", 20, 2, 500, 1),
                      "tenure": ("Tabu tenure (steps)", 10, 1, 200, 1)}},
}


def settings(name, values=None):
    """The method's settings: defaults, overridden by values (clipped to their range, ints kept int)."""
    out = {}
    for key, (_, default, lo, hi, _) in METAHEURISTICS[name]["params"].items():
        v = (values or {}).get(key, default)
        if isinstance(default, bool):
            out[key] = bool(v)
            continue
        v = min(max(float(v), lo), hi)
        out[key] = int(round(v)) if isinstance(default, int) else v
    if name == "GA":
        out["elites"] = min(out["elites"], out["population"] - 1)
        out["tournament"] = min(out["tournament"], out["population"])
    return out


def search(name, sequences, seed=0, params=None, progress=None):
    """Best operation sequence for an instance (sequences: [[(machine, tool, time), ...], ...]) and its makespan.
    progress(done, total) is called with the evaluations used so far."""
    jobs = [[(m, p) for m, _, p in job] for job in sequences]
    return METAHEURISTICS[name]["run"](jobs, np.random.default_rng(seed), progress=progress, **settings(name, params))
