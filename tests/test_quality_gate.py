from __future__ import annotations

import subprocess
import sys
from pathlib import Path


def test_quality_gate_script_passes():
    script = Path("scripts/verify_quality_gate.py")

    result = subprocess.run(
        [sys.executable, str(script)],
        capture_output=True,
        text=True,
        check=False,
    )

    assert result.returncode == 0, result.stdout + result.stderr
    assert "quality gate passed" in result.stdout.lower()
