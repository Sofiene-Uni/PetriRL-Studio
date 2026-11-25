"""Trains a stock agent and copies it to stock/agents/ (shipped with the app).
usage: python tools/train_stock.py <steps> "<name>" <instance_id> [more ids of the same size]
       [--standby off|on|gt] [--env basic|hyper] [--commitment k]"""
import argparse
import os
import shutil
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from studio import create_app  # noqa: E402
from studio.services import agent_library, storage, training_jobs  # noqa: E402

app = create_app()          # sets up storage and the stock library
parser = argparse.ArgumentParser()
parser.add_argument("steps", type=int)
parser.add_argument("name")
parser.add_argument("ids", nargs="+")
parser.add_argument("--standby", default="off")
parser.add_argument("--env", default="basic")
parser.add_argument("--commitment", type=int, default=5)
args = parser.parse_args()
steps, name = args.steps, args.name
job = training_jobs.start({"instance_ids": args.ids, "total_steps": steps, "name": name, "random_instances": True,
                           "standby": args.standby, "env": args.env,
                           "commitment_length": args.commitment, "n_envs": 4, "rollout_size": 4096, "batch_size": 512})
j = training_jobs.get(job["id"])
while j.status in ("queued", "running"):
    time.sleep(10)
    print(f"{j.timesteps:>9,} / {steps:,}  best {j.best}  fps {j.state()['fps']}", flush=True)
print(j.status, j.error)
if not j.agent_id:
    sys.exit(1)

meta = agent_library.get(j.agent_id)
sid = "stock_" + storage.slug(name.lower().replace(" ", "_"))
meta.update(id=sid, source="stock")
shutil.copy(agent_library.zip_file(j.agent_id), os.path.join(app.config["STOCK_DIR"], "agents", sid + ".zip"))
storage.write_json(os.path.join(app.config["STOCK_DIR"], "agents", sid + ".json"), meta)
agent_library.delete(j.agent_id)
print("stock agent", sid)
