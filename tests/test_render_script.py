from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path


def test_render_script_materializes_terraform_outputs(tmp_path: Path):
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

    output_dir = tmp_path / "rendered"
    result = subprocess.run(
        [sys.executable, "scripts/render_sprint1_k8s.py", str(input_path), str(output_dir)],
        capture_output=True,
        text=True,
        check=False,
    )

    assert result.returncode == 0, result.stdout + result.stderr
    assert "rendered manifests" in result.stdout
    assert "arn:aws:iam::123456789012:role/test-irsa" in (output_dir / "serviceaccount.yaml").read_text()
    assert "123456789012.dkr.ecr.ap-southeast-2.amazonaws.com/aml-platform/document-detection-engine:latest" in (
        output_dir / "deployment.yaml"
    ).read_text()
    assert (output_dir / "cluster-name.txt").read_text().strip() == "aml-platform-syd"
