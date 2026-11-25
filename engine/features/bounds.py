"""
engine/features/bounds.py (from PetriRL model_tools.py)

Lower bound on the final makespan for the current marking of the BasicEnv Petri net.
Used by the look-ahead observation (bound_components) and the dense reward
r_t = LB(s_t) - LB(s_{t+1})   (reward_f="L", lower_bound).

Also the Giffler-Thompson condition for the standby action (gt_condition).

Places used (see Petri_build.create_petri):
    job                 one per job, holds the not yet selected operations (FIFO)
    job_idle            one per job, holds a token while the job is free
    machine_buffer      one per machine, operations waiting for the machine (FIFO)
    machine_processing  one per machine, operation in process
Token: color = (job, machine, tool), time_features[0] = processing time
"""


def bound_components(sim):
    """Look-ahead quantities of the current marking (job and machine indices start at 1).

    job_ready[j]         time job j is free again (clock if idle)
    remaining_job[j]     work of job j not yet released (still in the job place)
    remaining_ops[j]     number of operations of job j not yet released
    machine_free[m]      time machine m has finished its current queue
    remaining_machine[m] work for machine m not yet released
    lb                   lower bound on the final makespan
    """
    clock = sim.clock
    job_ready = {j: clock for j in range(1, sim.n_jobs + 1)}
    machine_free = {}

    # machines: operation in process, then the FIFO buffer
    for m_idx, proc in enumerate(sim.cache["machine_processing"]):
        t = clock
        if proc.token_container:
            tok = proc.token_container[0]
            elapsed = tok.logging.get(proc.uid, [0, 0, 0])[2]
            t += tok.time_features[0] - elapsed
            job_ready[tok.color[0]] = t
        for tok in sim.cache["machine_buffer"][m_idx].token_container:
            t += tok.time_features[0]
            job_ready[tok.color[0]] = t
        machine_free[m_idx + 1] = t

    # operations not yet released, still in the job places
    remaining_job = {j: 0 for j in job_ready}
    remaining_ops = {j: 0 for j in job_ready}
    remaining_machine = {m: 0 for m in machine_free}
    for job_place in sim.cache["job"]:
        for tok in job_place.token_container:
            p = tok.time_features[0]
            remaining_job[tok.color[0]] += p
            remaining_ops[tok.color[0]] += 1
            remaining_machine[tok.color[1]] += p

    job_bound = max(job_ready[j] + remaining_job[j] for j in job_ready)
    machine_bound = max(machine_free[m] + remaining_machine[m] for m in machine_free)
    lb = max(job_bound, machine_bound, clock)
    return job_ready, remaining_job, remaining_ops, machine_free, remaining_machine, lb


def lower_bound(sim):
    """max(job bound, machine bound) for the current marking. Equals sim.clock (the makespan) at the end."""
    return bound_components(sim)[-1]


def gt_condition(sim):
    """Giffler-Thompson condition: True if waiting (standby) can lead to a better schedule.

    For each machine g that a free job wants next, C* is the earliest completion of those
    free jobs on g. Waiting can only help if some other job can reach g before C*; if none
    can, releasing now delays nobody, so the wait is never needed for the makespan.
    A job's earliest arrival at g walks its unreleased operations in order with lower-bound
    times (no earlier than the job is free and than the machine ends its queue), so the
    condition never blocks a useful wait.
    Valid for makespan rewards (G, L) on the deterministic net.
    """
    job_ready, _, _, machine_free, _, _ = bound_components(sim)
    jobs = range(1, sim.n_jobs + 1)
    queue = lambda j: sim.cache["job"][j - 1].token_container        # unreleased ops of job j
    free = [j for j in jobs if sim.cache["job_idle"][j - 1].token_container and queue(j)]

    for g in {queue(j)[0].color[1] for j in free}:
        group = [j for j in free if queue(j)[0].color[1] == g]
        c_star = min(machine_free[g] + queue(j)[0].time_features[0] for j in group)
        for k in jobs:
            if k in group:
                continue
            t = job_ready[k]                                           # clock if free, else end of its released op
            for tok in queue(k):
                m, p = tok.color[1], tok.time_features[0]
                if m == g:
                    if t < c_star:
                        return True
                    break
                t = max(t, machine_free[m]) + p
                if t >= c_star:
                    break
    return False
