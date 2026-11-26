"""Builds stock/benchmarks/ (instance files + catalog.json) from Thomas Weise's compilation of the 242
classic JSSP instances with their bounds: https://github.com/thomasWeise/jsspInstancesAndResults (2020).

usage: python tools/import_benchmarks.py <path to the cloned jsspInstancesAndResults repository>
Instances are written in the standard format (n_jobs n_machines, then machine time pairs, machines from 0).
"""
import csv
import json
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "stock", "benchmarks")

FAMILIES = [  # most used first; id, name, year, reference, prefix
    ("ta", "Taillard", 1993, "Taillard E (1993). Benchmarks for basic scheduling problems. European Journal of Operational Research 64(2), 278-285.", "ta"),
    ("dmu", "Demirkol, Mehta and Uzsoy", 1998, "Demirkol E, Mehta S, Uzsoy R (1998). Benchmarks for shop scheduling problems. European Journal of Operational Research 109(1), 137-141.", "dmu"),
    ("la", "Lawrence", 1984, "Lawrence SR (1984). Resource constrained project scheduling: an experimental investigation of heuristic scheduling techniques (Supplement). Carnegie-Mellon University.", "la"),
    ("ft", "Fisher and Thompson", 1963, "Fisher H, Thompson GL (1963). Probabilistic learning combinations of local job-shop scheduling rules. In Industrial Scheduling, 225-251.", "ft"),
    ("abz", "Adams, Balas and Zawack", 1988, "Adams J, Balas E, Zawack D (1988). The shifting bottleneck procedure for job shop scheduling. Management Science 34(3), 391-401.", "abz"),
    ("orb", "Applegate and Cook", 1991, "Applegate D, Cook W (1991). A computational study of the job-shop scheduling problem. ORSA Journal on Computing 3(2), 149-156.", "orb"),
    ("swv", "Storer, Wu and Vaccari", 1992, "Storer RH, Wu SD, Vaccari R (1992). New search spaces for sequencing problems with application to job shop scheduling. Management Science 38(10), 1495-1509.", "swv"),
    ("yn", "Yamada and Nakano", 1992, "Yamada T, Nakano R (1992). A genetic algorithm applicable to large-scale job-shop instances. PPSN II, 281-290.", "yn"),
]


def parse_instances(path):
    """Blocks: ' instance NAME', '+++', description, 'n m', job rows, '+++'."""
    text = open(path, encoding="utf-8").read()
    out = {}
    for m in re.finditer(r"^ instance (\S+)\s*\n\s*\++\s*\n(.*?)\n(.*?)\n\s*\++", text, re.S | re.M):
        name, desc, body = m.group(1), m.group(2).strip(), m.group(3)
        rows = [[int(x) for x in line.split()] for line in body.strip().splitlines() if line.strip()]
        n, mm = rows[0]
        jobs = rows[1:]
        assert len(jobs) == n and all(len(r) == 2 * mm for r in jobs), name
        original = re.search(r"original name: ([^;]+)", desc)
        out[name] = {"rows": rows, "original": original.group(1).strip() if original else None}
    return out


def parse_bib(path):
    """key -> short citation 'Author et al. (year)' and the title."""
    text = open(path, encoding="utf-8").read()
    refs = {}
    for m in re.finditer(r"@\w+\{([^,]+),(.*?)\n\}", text, re.S):
        key, body = m.group(1).strip(), m.group(2)
        field = lambda f: (re.search(rf"\b{f}\s*=\s*[{{\"](.+?)[}}\"],?\s*\n", body, re.S) or [None, ""])[1]
        authors = [a.strip() for a in re.sub(r"[{}]", "", field("author")).split(" and ") if a.strip()]
        surname = lambda a: a.split(",")[0].strip() if "," in a else a.split()[-1]
        who = surname(authors[0]) + (" et al." if len(authors) > 2 else f" and {surname(authors[1])}" if len(authors) == 2 else "") if authors else key
        year = re.sub(r"\D", "", field("year"))[:4]
        title = re.sub(r"[{}\s]+", " ", field("title")).strip()
        doi = field("doi").strip()
        refs[key] = {"short": f"{who} ({year})" if year else who, "title": title, "doi": doi or None}
    return refs


def main(repo):
    raw = os.path.join(repo, "data-raw")
    instances = parse_instances(os.path.join(raw, "instance-data", "instance_data.txt"))
    bib = parse_bib(os.path.join(raw, "bibliography", "bibliography.bib"))
    rows = list(csv.DictReader(open(os.path.join(raw, "instances", "instances_with_bks.txt"))))
    used_refs = {}

    families = []
    for fid, fname, year, reference, prefix in FAMILIES:
        items = []
        for r in rows:
            name = r["inst.id"]
            if not re.fullmatch(rf"{prefix}\d+", name):
                continue
            inst = instances[name]
            folder = os.path.join(OUT, "jssp", fid)
            os.makedirs(folder, exist_ok=True)
            with open(os.path.join(folder, f"{name}.txt"), "w") as f:
                f.write("\n".join(" ".join(str(v) for v in row) for row in inst["rows"]) + "\n")
            lb, bks = int(r["inst.opt.bound.lower"]), int(r["inst.bks"])
            for k in (r["inst.opt.bound.lower.ref"], r["inst.bks.ref"]):
                used_refs[k] = bib.get(k, {"short": k, "title": "", "doi": None})
            items.append({"name": name, "n_jobs": int(r["inst.jobs"]), "n_machines": int(r["inst.machines"]),
                          "lower_bound": lb, "best_known": bks, "optimal": lb == bks,
                          "lower_bound_ref": r["inst.opt.bound.lower.ref"], "best_known_ref": r["inst.bks.ref"],
                          **({"original_name": inst["original"]} if inst["original"] else {})})
        items.sort(key=lambda i: int(re.sub(r"\D", "", i["name"])))
        families.append({"id": fid, "name": fname, "year": year, "reference": reference, "instances": items})
        print(f"{fid:4} {len(items):3} instances, {sum(i['optimal'] for i in items):3} with a proven optimum")

    catalog = {
        "source": "Weise T (2020). jsspInstancesAndResults: results, data, and instances of the job shop "
                  "scheduling problem. https://github.com/thomasWeise/jsspInstancesAndResults. Bounds as compiled in 2020.",
        "problem_types": {
            "jssp": {"name": "Job shop", "description": "n jobs, m machines, each job visits the machines in its own fixed order; minimize the makespan.",
                     "families": families},
        },
        "references": used_refs,
    }
    with open(os.path.join(OUT, "catalog.json"), "w") as f:
        json.dump(catalog, f, indent=1)
    print("total", sum(len(f["instances"]) for f in families), "->", OUT)


if __name__ == "__main__":
    main(sys.argv[1])
