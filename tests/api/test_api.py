import io
import os

from tests.conftest import solve

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))


def test_health(client):
    r = client.get("/api/health").get_json()
    assert r["status"] == "ok" and "basic" in r["envs"] and "SPT" in r["rules"]


def test_benchmarks_are_listed_by_type_and_family(client):
    insts = client.get("/api/instances").get_json()
    assert sum(i["source"] == "benchmark" for i in insts) == 242
    tree = client.get("/api/benchmarks").get_json()["problem_types"][0]
    assert tree["id"] == "jssp"
    assert {f["id"]: len(f["instances"]) for f in tree["families"]} == {
        "ft": 3, "la": 40, "abz": 5, "orb": 10, "swv": 20, "yn": 4, "ta": 80, "dmu": 80}


def test_reference_values(client):
    ft06 = client.get("/api/instances/jssp:ft06").get_json()["reference"]
    ta41 = client.get("/api/instances/jssp:ta41").get_json()["reference"]
    assert (ft06["kind"], ft06["value"]) == ("optimum", 55)
    assert ta41["kind"] == "best known" and ta41["value"] > ta41["lower_bound"]
    assert client.patch("/api/instances/jssp:ta41", json={"best_known": 100}).status_code == 400
    own = client.patch("/api/instances/jssp:ta41", json={"best_known": ta41["value"] - 1}).get_json()["reference"]
    assert own["source"] == "your value"


def test_upload_of_a_benchmark_gets_its_reference(client):
    ta01 = "15 15\n" + open(os.path.join(ROOT, "stock", "benchmarks", "jssp", "ta", "ta01.txt")).read().split("\n", 1)[1]
    up = client.post("/api/instances", data={"files": [(io.BytesIO(ta01.encode()), "my_ta01.txt")]},
                     content_type="multipart/form-data").get_json()["added"][0]
    assert up["matches"] == "jssp:ta01" and up["reference"]["value"] == 1231


def test_upload_reports_errors_per_file(client):
    files = {"files": [(io.BytesIO(b"2 2\n0 3 1 2\n1 4 0 1\n"), "mini.txt"), (io.BytesIO(b"nope"), "bad.txt")]}
    r = client.post("/api/instances", data=files, content_type="multipart/form-data").get_json()
    assert [a["name"] for a in r["added"]] == ["mini"]
    assert r["errors"][0]["file"] == "bad.txt"


def test_solve_rule_and_read_run(client):
    r = solve(client, ["jssp:ft06"], ["rule:SPT"])
    run = r["results"][0]
    assert run["status"] == "done" and run["makespan"] >= run["reference"]["value"] == 55
    assert run["gap"] == round(100 * (run["makespan"] - 55) / 55, 2)
    assert client.get("/api/runs").get_json()[0]["id"] == run["id"]
    full = client.get(f"/api/runs/{run['id']}").get_json()
    assert len(full["schedule"]) == 36 and full["events"] and full["net"]["nodes"]
    csv = client.get(f"/api/runs/{run['id']}/plan.csv").get_data(as_text=True)
    assert csv.splitlines()[0] == "machine,job,operation,start,end,duration" and len(csv.splitlines()) == 37


def test_errors_are_json(client):
    assert client.get("/api/runs/run_missing").status_code == 404
    r = client.post("/api/instances/random", json={"n_jobs": 1, "n_machines": 1})
    assert r.status_code == 400 and "size" in r.get_json()["error"]
    assert client.delete("/api/instances/jssp:ft06").status_code == 403


def test_solve_with_a_metaheuristic(client):
    assert {"meta:GA", "meta:SA", "meta:TS"} <= {a["id"] for a in client.get("/api/agents").get_json()}
    run = solve(client, ["jssp:ft06"], ["meta:GA"])["results"][0]
    assert run["status"] == "done" and run["agent"]["kind"] == "meta" and 55 <= run["makespan"] <= 61


def test_visitor_counter_is_saved_in_the_data_folder(client):
    assert client.get("/api/visits").get_json() == {"visits": 0, "visitors": 0}
    client.post("/api/visits", json={"id": "browser-a"})
    client.post("/api/visits", json={"id": "browser-a"})
    assert client.post("/api/visits", json={"id": "browser-b"}).get_json() == {"visits": 3, "visitors": 2}
