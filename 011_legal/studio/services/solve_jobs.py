"""Solve jobs: every chosen agent on every chosen instance, run in the background through the compute queue.
The client polls the job: while it waits it gets its place in line, then the progress, then the results."""
import threading
import traceback

from studio.services import agent_library as agents
from studio.services import compute_queue
from studio.services import episode_runner as runner
from studio.services import instance_library as instances
from studio.services import storage

_jobs, _lock = {}, threading.Lock()
KEEP = 100                     # finished jobs kept in memory (their runs are saved on disk anyway)


class Job:
    def __init__(self, pairs, skipped, deterministic, seed, params):
        self.id = storage.new_id("solve")
        self.pairs, self.skipped = pairs, skipped
        self.deterministic, self.seed, self.params = deterministic, seed, params
        self.status, self.error, self.results = "queued", None, []
        self.current = None        # the pair being computed: instance, agent, phase, done, total
        self.ticket = compute_queue.join()

    def state(self):
        st = {"id": self.id, "status": self.status, "error": self.error, "done": len(self.results),
              "total": len(self.pairs), "position": compute_queue.position(self.ticket) if self.status == "queued" else 0,
              "current": self.current}
        if self.status == "done":
            st.update(results=self.results, skipped=self.skipped)
        return st


def start(instance_ids, agent_ids, deterministic=True, seed=0, params=None):
    """Checks the pairs now (unknown ids and size mismatches answer at once), computes them in the background.
    params: settings per metaheuristic id, e.g. {"meta:GA": {"evals": 5000, "population": 60}}."""
    pairs, skipped = [], []
    for iid in instance_ids:
        inst = instances.get(iid)
        for aid in agent_ids:
            agent = agents.get(aid)
            if agents.compatible(agent, inst):
                pairs.append((iid, aid))
            else:
                skipped.append({"instance": inst["name"], "agent": agent["name"],
                                "reason": f"agent is {agent['n_jobs']}x{agent['n_machines']}, "
                                          f"instance is {inst['n_jobs']}x{inst['n_machines']}"})
    job = Job(pairs, skipped, deterministic, seed, params or {})
    with _lock:
        _jobs[job.id] = job
        for old in list(_jobs)[:-KEEP]:
            del _jobs[old]
    threading.Thread(target=_run, args=(job,), daemon=True).start()
    return job.state()


def get(jid):
    with _lock:
        if jid not in _jobs:
            raise KeyError(f"solve job {jid} not found")
        return _jobs[jid]


def _run(job):
    compute_queue.wait(job.ticket)
    job.status = "running"
    try:
        for iid, aid in job.pairs:
            cur = job.current = {"instance": instances.get(iid)["name"], "agent": agents.get(aid)["name"],
                                 "phase": "episode", "done": 0, "total": 1}

            def progress(phase, done, total, cur=cur):
                cur["searched"] = cur.get("searched") or (cur["phase"] == "search" and phase == "episode")
                cur["phase"], cur["done"], cur["total"] = phase, done, total
            job.results.append(runner.run(iid, aid, deterministic=job.deterministic, seed=job.seed,
                                          params=job.params.get(aid), progress=progress))
        job.current = None
        job.status = "done"
    except Exception as e:  # noqa: BLE001  (reported in the UI)
        job.status, job.error = "failed", str(e)
        traceback.print_exc()
    finally:
        compute_queue.leave(job.ticket)
