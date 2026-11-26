"""Records the episode replayed on the home page into studio/static/demo/home-run.json.
The home page reads this static file, so it starts without loading PyTorch or running an agent.
usage: python tools/export_home_demo.py [instance_id] [agent_id]"""
import json
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, ROOT)
from studio import create_app  # noqa: E402
from studio.services import episode_runner  # noqa: E402

KEEP = ("instance", "agent", "standby", "env", "action_keys", "makespan", "net", "tokens", "initial", "events",
        "decisions", "schedule")

instance_id = sys.argv[1] if len(sys.argv) > 1 else "jssp:ft06"
agent_id = sys.argv[2] if len(sys.argv) > 2 else "stock_ppo_6x6_wait"
with create_app().app_context():
    rec = episode_runner.run(instance_id, agent_id, save=False)
out = os.path.join(ROOT, "studio", "static", "demo", "home-run.json")
with open(out, "w") as f:
    json.dump({k: rec[k] for k in KEEP}, f, separators=(",", ":"))
print(f"{rec['instance']['name']} with {rec['agent']['name']}: makespan {rec['makespan']}, "
      f"{len(rec['decisions'])} decisions -> {out} ({os.path.getsize(out) // 1024} KB)")
