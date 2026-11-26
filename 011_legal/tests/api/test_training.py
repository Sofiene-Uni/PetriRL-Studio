import time

from tests.conftest import solve


def test_short_training_saves_an_agent_that_solves(client):
    inst = client.post("/api/instances/random", json={"n_jobs": 3, "n_machines": 3, "seed": 0}).get_json()
    job = client.post("/api/train", json={"instance_ids": [inst["id"]], "total_steps": 2048, "rollout_size": 512,
                                         "batch_size": 64, "n_envs": 1, "standby": "gt"}).get_json()
    for _ in range(120):
        st = client.get(f"/api/train/{job['id']}").get_json()
        if st["status"] not in ("queued", "running"):
            break
        time.sleep(0.5)
    assert st["status"] == "done", st["error"]
    agent = next(a for a in client.get("/api/agents").get_json() if a["id"] == st["agent_id"])
    assert (agent["n_jobs"], agent["n_machines"], agent["standby"]) == (3, 3, "gt")

    run = solve(client, [inst["id"]], [agent["id"]])["results"][0]
    full = client.get(f"/api/runs/{run['id']}").get_json()
    assert full["status"] == "done" and full["standby"] == "gt"
    assert all("wait" in d and "wait_enabled" in d for d in full["decisions"])


def test_training_rejects_mixed_sizes(client):
    r = client.post("/api/train", json={"instance_ids": ["jssp:ft06", "jssp:ta01"]})
    assert r.status_code == 400 and "same size" in r.get_json()["error"]


def test_hyper_heuristic_agent_trains_and_records_macros(client):
    job = client.post("/api/train", json={"instance_ids": ["jssp:ft06"], "env": "hyper", "commitment_length": 3,
                                         "total_steps": 2048, "rollout_size": 512, "batch_size": 64, "n_envs": 1}).get_json()
    for _ in range(120):
        st = client.get(f"/api/train/{job['id']}").get_json()
        if st["status"] not in ("queued", "running"):
            break
        time.sleep(0.5)
    assert st["status"] == "done", st["error"]
    run = solve(client, ["jssp:ft06"], [st["agent_id"]])["results"][0]
    full = client.get(f"/api/runs/{run['id']}").get_json()
    assert full["env"]["name"] == "hyper" and full["env"]["commitment_length"] == 3
    assert len(full["macros"]) == 12 and len(full["decisions"]) == 36
    assert all(d["macro"] == i // 3 and d["step"] == i % 3 for i, d in enumerate(full["decisions"]))
    assert set(full["macros"][0]["probs"]) <= set(full["action_keys"])


def test_hyper_env_refuses_wait(client):
    r = client.post("/api/train", json={"instance_ids": ["jssp:ft06"], "env": "hyper", "standby": "gt"})
    assert r.status_code == 400


def test_milestone_saves_an_agent_and_training_goes_on(client):
    inst = client.post("/api/instances/random", json={"n_jobs": 3, "n_machines": 3, "seed": 1}).get_json()
    job = client.post("/api/train", json={"instance_ids": [inst["id"]], "total_steps": 20_000, "rollout_size": 512,
                                         "batch_size": 64, "n_envs": 1, "name": "ms"}).get_json()
    for _ in range(120):
        st = client.get(f"/api/train/{job['id']}").get_json()
        if st["status"] == "running" and st["timesteps"] > 0:
            break
        time.sleep(0.25)
    assert client.post(f"/api/train/{job['id']}/milestone").status_code == 200
    for _ in range(120):
        st = client.get(f"/api/train/{job['id']}").get_json()
        if st["milestones"]:
            break
        time.sleep(0.25)
    m = st["milestones"][0]
    assert st["status"] == "running"                                    # it did not stop
    agent = next(a for a in client.get("/api/agents").get_json() if a["id"] == m["agent_id"])
    assert agent["name"].startswith("ms @ ") and agent["n_jobs"] == 3
    client.post(f"/api/train/{job['id']}/cancel")
    for _ in range(120):
        if client.get(f"/api/train/{job['id']}").get_json()["status"] not in ("queued", "running"):
            break
        time.sleep(0.25)
    assert client.post(f"/api/train/{job['id']}/milestone").status_code == 409
