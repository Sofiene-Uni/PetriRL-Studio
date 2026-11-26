import numpy as np

from engine.features.bounds import bound_components

FEAT_PER_PLACE = 15


def get_obs_basic(places):
    places = list(places)
    obs = np.zeros((len(places), FEAT_PER_PLACE), dtype=np.float32)
    for i, place in enumerate(places):
        if place.token_container:
            token = place.token_container[0]
            # remaining process time only counts down on a machine; elsewhere elapsed is waiting time
            remaining = token.time_features[0]
            if place.type == "p":
                remaining -= token.logging.get(place.uid, [0, 0, 0])[2]

            obs[i] = (len(place.token_container), token.rank, int(token.last_op),
                      *token.color, *token.machine_sequence, *token.time_features,
                      remaining)
    return obs.ravel()


def get_lookahead(sim):
    """Look-ahead features computed from the Petri net (all times relative to the clock).

    per job     : time until free, remaining work, remaining operations, slack to the bound
    per machine : time until free (queue), remaining work, slack to the bound
    global      : bound minus clock, fraction of operations released
    A slack of 0 means the job or machine is critical (it determines the bound).
    """
    job_ready, rem_job, rem_ops, machine_free, rem_machine, lb = bound_components(sim)
    clock = sim.clock

    jobs = []
    for j in sorted(job_ready):
        end_j = job_ready[j] + rem_job[j]
        jobs += [job_ready[j] - clock, rem_job[j], rem_ops[j], lb - end_j]

    machines = []
    for m in sorted(machine_free):
        end_m = machine_free[m] + rem_machine[m]
        machines += [machine_free[m] - clock, rem_machine[m], lb - end_m]

    released = 1.0 - sum(rem_ops.values()) / max(sim.number_of_ops, 1)
    return np.array(jobs + machines + [lb - clock, released], dtype=np.float32)


def get_obs_lookahead(sim):
    """Basic place features + look-ahead features."""
    return np.concatenate([get_obs_basic(sim.cache["places"]), get_lookahead(sim)])


def lookahead_scale(sim):
    """Divisor for each feature of get_obs_lookahead, built from the instance scales.

    Place features : counts and ranks by the number of operations per job, job / machine / tool
                     numbers by their count, the times of one operation by the largest process time.
    Look-ahead     : times by the makespan lower bound, remaining operations by ops per job.
    Computed once per instance, so every instance is seen on the same scale.
    """
    s = sim.instance.scales
    nj, nm, ops = sim.n_jobs, sim.n_machines, max(sim.max_ops, 1)
    p, lb = s["max_p"], s["lb"]

    place = [max(nj, ops), ops, 1,                 # n tokens, rank, last op
             nj, nm, max(sim.n_tools, 1),          # color: job, machine, tool
             nm, nm, nm,                           # previous, current, next machine
             p, p, p, p, p,                        # time features
             p]                                    # remaining process time
    jobs = [lb, lb, ops, lb] * nj                  # time until free, remaining work, remaining ops, slack
    machines = [lb, lb, lb] * nm                   # time until free, remaining work, slack
    return np.array(place * len(sim.cache["places"]) + jobs + machines + [lb, 1], dtype=np.float32)


