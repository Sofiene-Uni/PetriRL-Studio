import os
import sys

import pytest

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, ROOT)

from engine.instances import Instance, parse_instance  # noqa: E402


@pytest.fixture
def ft06():
    with open(os.path.join(ROOT, "stock", "benchmarks", "jssp", "ft", "ft06.txt")) as f:
        seq, nm, _ = parse_instance(f.read())
    return Instance(seq, nm, name="ft06")


@pytest.fixture
def client(tmp_path):
    from studio import create_app
    app = create_app("testing", DATA_DIR=str(tmp_path))
    return app.test_client()
