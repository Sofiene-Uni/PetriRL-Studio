from tests.conftest import solve


def test_replay_an_uploaded_solution_and_export_it(client):
    spt = solve(client, ["jssp:ft06"], ["rule:SPT"])["results"][0]
    machines = client.get(f"/api/runs/{spt['id']}/solution.txt?format=machines").get_data(as_text=True)
    firing = client.get(f"/api/runs/{spt['id']}/solution.txt?format=firing").get_data(as_text=True)
    for text in (machines, firing):
        run = client.post("/api/solutions/replay", json={"instance_id": "jssp:ft06", "text": text, "name": "x"}).get_json()
        assert run["makespan"] == spt["makespan"]
    bad = client.post("/api/solutions/replay", json={"instance_id": "jssp:ft06", "text": "1 2 3"})
    assert bad.status_code == 400


def test_best_known_solution_from_optimizizer(client, monkeypatch):
    from studio.services import known_solutions
    # a solution page built from our own optimal-looking run: machine orders of a good ft06 schedule
    run = solve(client, ["jssp:ft06"], ["meta:GA"])["results"][0]
    rows = client.get(f"/api/runs/{run['id']}/solution.txt?format=machines").get_data(as_text=True)
    pages = {known_solutions.INDEX_URL: '<a href="solution.php?name=ta01&amp;UB=%d&amp;problemclass=ta">' % run["makespan"]}
    monkeypatch.setattr(known_solutions, "_download", lambda url, timeout=20: pages.get(url, f"<pre>{rows}</pre>"))
    real_get = known_solutions.instances.get          # pretend ft06 is a Taillard instance
    monkeypatch.setattr(known_solutions.instances, "get", lambda iid: {**real_get(iid), "name": "ta01"})
    res = client.post("/api/solutions/fetch", json={"instance_ids": ["jssp:ft06"]}).get_json()
    assert res["failed"] == [] and res["done"][0]["makespan"] == run["makespan"]
    assert "solution:known" in {a["id"] for a in client.get("/api/agents").get_json()}
    replay = client.post("/api/solutions/replay", json={"instance_id": "jssp:ft06"}).get_json()
    assert replay["makespan"] == run["makespan"]
    full = client.get(f"/api/runs/{replay['id']}").get_json()
    assert "optimizizer.com" in full["agent"]["citation"]
    # stored once: a second fetch does not download again
    monkeypatch.setattr(known_solutions, "_download", lambda *a, **k: (_ for _ in ()).throw(AssertionError("downloaded twice")))
    again = client.post("/api/solutions/fetch", json={"instance_ids": ["jssp:ft06"]}).get_json()
    assert again["failed"] == [] and again["done"][0]["makespan"] == run["makespan"]


def test_shipped_solution_is_found(client, tmp_path, monkeypatch):
    from studio.services import known_solutions, storage
    stock = tmp_path / "stock" / "solutions"
    stock.mkdir(parents=True)
    (stock / "jssp_ft06.json").write_text('{"instance_id": "jssp:ft06", "orders": [], "makespan": 55, "source": "optimizizer.com",'
                                         ' "url": null, "citation": "c", "retrieved": "now"}')
    monkeypatch.setattr(storage, "stock", lambda *parts: str(tmp_path.joinpath("stock", *parts)))
    assert known_solutions.has("jssp:ft06") and known_solutions.get("jssp:ft06")["makespan"] == 55
    assert [s["instance_id"] for s in known_solutions.list_all()] == ["jssp:ft06"]
