import subprocess
import sys
from pathlib import Path


def test_every_js_module_imports_what_it_uses():
    script = Path(__file__).resolve().parents[1] / "tools" / "check_js_imports.py"
    r = subprocess.run([sys.executable, str(script)], capture_output=True, text=True)
    assert r.returncode == 0, r.stdout
