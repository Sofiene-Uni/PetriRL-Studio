"""Known solutions replayed on the Petri net.

Two formats are read (job numbers from 0 or from 1, detected; header lines without numbers only are skipped):

- machine orders: one row per machine (machine 1 first), the jobs in the order the machine processes them,
  as on optimizizer.com. Replayed with the wait action: a job is released when it is its turn on its machine,
  so the net builds the semi-active schedule of these orders.
- firing sequence: the jobs in the order their next operation is released (one number per operation, rows or
  one line), optionally with "w" where the agent waited, as exported from a run. Replayed as is: each entry is
  one decision; without "w" entries the next job is released as soon as the net allows it.
"""
import re
from collections import deque


class SolutionError(ValueError):
    pass


def parse(text, jobs, n_machines):
    """('machines', orders) or ('firing', sequence), 0-based jobs. jobs: [[(machine, time), ...], ...]."""
    token = lambda x: -1 if x.lower() in ("w", "wait") else int(x)      # -1: the agent waited
    rows = [[token(x) for x in re.split(r"[\s,;]+", line.strip()) if x]
            for line in text.splitlines() if re.fullmatch(r"(?:\d+|w|wait)(?:[\s,;]+(?:\d+|w|wait))*", line.strip(), re.I)]
    if not rows:
        raise SolutionError("no rows of job numbers found")
    waits = any(x < 0 for r in rows for x in r)
    rows = [[x for x in r if x >= 0] if not waits else r for r in rows]
    nums = [x for r in rows for x in r if x >= 0]
    n = len(jobs)
    if min(nums) >= 1 and max(nums) == n:
        rows = [[x - 1 if x >= 0 else x for x in r] for r in rows]
    elif min(nums) < 0 or max(nums) >= n:
        raise SolutionError(f"job numbers must be 0..{n - 1} or 1..{n}")

    per_machine = {m: sorted(j for j, job in enumerate(jobs) for mm, _ in job if mm == m) for m in range(1, n_machines + 1)}
    if not waits and len(rows) == n_machines and all(sorted(r) == per_machine[m + 1] for m, r in enumerate(rows)):
        return "machines", rows
    seq = [x for r in rows for x in r]
    if sorted(x for x in seq if x >= 0) == sorted(j for j, job in enumerate(jobs) for _ in job):
        return "firing", seq
    raise SolutionError(f"expected {n_machines} rows of machine orders, or a firing sequence with each job once per "
                        f"operation ({sum(len(j) for j in jobs)} numbers); got {len(rows)} rows and {len(nums)} numbers")


def sequence_from_machine_orders(orders, jobs):
    """An operation sequence that respects the job routes and the machine orders (raises if they conflict)."""
    n = len(jobs)
    pos = {}                                                 # (job, op) -> index of the op on its machine
    for m, row in enumerate(orders, start=1):
        for i, j in enumerate(row):
            pos[(j, next(k for k, (mm, _) in enumerate(jobs[j]) if mm == m))] = (m, i)
    nxt, turn, seq = [0] * n, {m: 0 for m in range(1, len(orders) + 1)}, []
    queue = deque(range(n))
    stuck = 0
    while queue:
        j = queue.popleft()
        if nxt[j] == len(jobs[j]):
            continue
        m, i = pos[(j, nxt[j])]
        if turn[m] == i:
            seq.append(j)
            turn[m] += 1
            nxt[j] += 1
            stuck = 0
        else:
            stuck += 1
            if stuck > len(queue) + 1:
                raise SolutionError("these machine orders contradict the job routes (the schedule would deadlock)")
        queue.append(j)
    return seq


def firing_choice(seq):
    """Rule for the env: choose(sim, mask) releases the next job of the list when allowed, else waits.
    A -1 entry is an explicit wait."""
    it = iter(seq)
    state = {"next": next(it, None)}

    def choose(sim, mask):
        j = state["next"]
        if j == -1:
            if sim.standby_index is None or not mask[sim.standby_index]:
                raise SolutionError("the sequence waits where the net does not allow it")
            state["next"] = next(it, None)
            return sim.standby_index
        for action, on in enumerate(mask):
            tr = sim.action_map[action]
            if on and tr.role == "job_select" and tr.color - 1 == j:
                state["next"] = next(it, None)
                return action
        if sim.standby_index is not None and mask[sim.standby_index]:
            return sim.standby_index
        raise SolutionError(f"job {j} cannot be released now and nothing is running to wait for")
    return choose


def export(schedule, decisions, n_machines):
    """A run as text: machine orders (rows, 0-based jobs) and the firing sequence (with w for waits)."""
    rows = [[r["job"] - 1 for r in sorted((r for r in schedule if r["machine"] == m), key=lambda r: r["start"])]
            for m in range(1, n_machines + 1)]
    machines = "\n".join(" ".join(map(str, r)) for r in rows) + "\n"
    firing = " ".join("w" if d["wait"] else str(d["job"] - 1) for d in decisions) + "\n"
    return machines, firing
