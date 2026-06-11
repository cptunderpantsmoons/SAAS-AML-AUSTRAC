from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path


def test_deploy_script_prints_the_rollout_commands(tmp_path: Path):
    tf_output = {
        "document_engine_irsa_role_arn": {"value": "arn:aws:iam::123456789012:role/test-irsa"},
        "repository_uri": {
            "value": (
                "123456789012.dkr.ecr.ap-southeast-2.amazonaws.com"
                "/aml-platform/document-detection-engine"
            )
        },
        "cluster_name": {"value": "aml-platform-syd"},
    }
    input_path = tmp_path / "terraform-output.json"
    input_path.write_text(json.dumps(tf_output))

    result = subprocess.run(
        [
            sys.executable,
            "scripts/deploy_sprint1.py",
            "--terraform-output",
            str(input_path),
            "--account-id",
            "123456789012",
        ],
        capture_output=True,
        text=True,
        check=False,
    )

    assert result.returncode == 0, result.stdout + result.stderr
    assert "aws eks update-kubeconfig" in result.stdout
    assert "docker tag document-detection-engine:latest" in result.stdout
    assert "docker push" in result.stdout
    assert "kubectl apply -f" in result.stdout
