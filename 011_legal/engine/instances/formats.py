"""Reading and writing instance files (standard OR-Library, Taillard, PetriRL/Solax)."""
import re

from engine.instances.instance import InstanceError


def parse_instance(text):
    """Detects the format and returns (sequences, n_machines, format_name).

    standard  : 'n_jobs n_machines' then one row per job: machine time machine time ...
    taillard  : 'n_jobs n_machines' then n_jobs rows of times and n_jobs rows of machines
                (optional 'Times' / 'Machines' header lines, as on Taillard's site)
    solax     : 'n_jobs n_machines n_tools' then one row per job: machine tool time ...
    Machines numbered from 0 are shifted to 1..n.
    """
    rows = []
    for line in text.replace("\r", "").split("\n"):
        line = line.split("#")[0].strip()
        if not line:
            continue
        nums = re.findall(r"-?\d+", line)
        if not nums:
            continue                                  # 'Times', 'Machines', text lines
        if re.search(r"[a-zA-Z]", line) and len(nums) < 2:
            continue
        rows.append([int(n) for n in nums])

    # Taillard site files: "Nb of jobs, Nb of Machines, Time seed, ..." header with 6 numbers
    if rows and len(rows[0]) == 6 and len(rows) > 1 and len(rows[1]) > 6:
        rows[0] = rows[0][:2]
    if not rows or len(rows[0]) not in (2, 3):
        raise InstanceError("first line must be 'n_jobs n_machines' (or 'n_jobs n_machines n_tools')")

    header, body = rows[0], rows[1:]
    n_jobs, n_machines = header[0], header[1]
    if n_jobs <= 0 or n_machines <= 0:
        raise InstanceError("n_jobs and n_machines must be positive")

    if len(header) == 3:
        fmt, width = "solax", 3
    elif len(body) == 2 * n_jobs and all(len(r) == n_machines for r in body):
        fmt = "taillard"
    else:
        fmt, width = "standard", 2

    if fmt == "taillard":
        times, machines = body[:n_jobs], body[n_jobs:]
        jobs = [[(m, 0, p) for m, p in zip(mrow, trow)] for trow, mrow in zip(times, machines)]
    else:
        if len(body) < n_jobs:
            raise InstanceError(f"{n_jobs} jobs announced but only {len(body)} job rows found")
        jobs = []
        for j, r in enumerate(body[:n_jobs], start=1):
            if len(r) % width:
                raise InstanceError(f"job {j}: {len(r)} numbers, expected a multiple of {width}")
            ops = [r[i:i + width] for i in range(0, len(r), width)]
            jobs.append([(o[0], 0, o[1]) if width == 2 else (o[0], o[1], o[2]) for o in ops])

    if min(m for job in jobs for m, _, _ in job) == 0:   # 0-indexed machines
        jobs = [[(m + 1, t, p) for m, t, p in job] for job in jobs]
    return jobs, n_machines, fmt


def to_text(sequences, n_machines):
    """Standard format (machines 0-indexed, as in the OR-Library)."""
    lines = [f"{len(sequences)} {n_machines}"]
    for job in sequences:
        lines.append(" ".join(f"{m - 1} {p}" for m, _, p in job))
    return "\n".join(lines) + "\n"
