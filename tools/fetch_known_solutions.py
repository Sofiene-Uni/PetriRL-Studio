"""Downloads the optimizizer.com best known solutions of all Taillard instances once and stores them in
stock/solutions, so they ship with the app and are never fetched again. Each one is checked by replaying it on
the Petri net. Run from the project folder:  python tools/fetch_known_solutions.py
(Before shipping them in a commercial package, ask optimizizer.com / Oleg Shylo for permission.)"""
import os
import shutil
import sys
import tempfile

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from studio import create_app  # noqa: E402


def main():
    app = create_app("development", DATA_DIR=tempfile.mkdtemp())
    with app.app_context():
        from studio.services import instance_library as instances
        from studio.services import known_solutions as known
        from studio.services import storage
        target = storage.stock(known.FOLDER)
        os.makedirs(target, exist_ok=True)
        bounds = known.taillard_bounds()
        ids = [i["id"] for i in instances.list_all() if i.get("family") == "ta" or i["name"].startswith("ta")]
        for iid in ids:
            if os.path.exists(os.path.join(target, known._name(iid))):
                continue
            try:
                rec = known.fetch_taillard(iid, bounds)
                shutil.copy(known._file(iid), target)
                print(f"{iid}: makespan {rec['makespan']}")
            except Exception as e:  # noqa: BLE001
                print(f"{iid}: {e}")
        print(f"{len(os.listdir(target))} solutions in {target}")


if __name__ == "__main__":
    main()
