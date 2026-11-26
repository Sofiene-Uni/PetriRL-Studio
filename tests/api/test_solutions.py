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


def test_stored_solution_replays_with_its_source(client):
    agents = {a["id"]: a for a in client.get("/api/agents").get_json()}
    assert "solution:known" in agents
    run = client.post("/api/solutions/replay", json={"instance_id": "jssp:ta01"}).get_json()
    assert run["makespan"] == 1231
    full = client.get(f"/api/runs/{run['id']}").get_json()
    assert "optimizizer.com" in full["agent"]["citation"]
    assert client.post("/api/solutions/replay", json={"instance_id": "jssp:ta02"}).status_code == 400
