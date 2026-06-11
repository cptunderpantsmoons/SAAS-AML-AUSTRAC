from __future__ import annotations

import json
import sys
from pathlib import Path


def main() -> int:
    if len(sys.argv) != 3:
        raise SystemExit(
            "usage: render_sprint1_k8s.py <terraform-output-json> <output-directory>"
        )

    terraform_output = json.loads(Path(sys.argv[1]).read_text())
    output_dir = Path(sys.argv[2])
    output_dir.mkdir(parents=True, exist_ok=True)

    irsa_role_arn = terraform_output["document_engine_irsa_role_arn"]["value"]
    repository_uri = (
        terraform_output["repository_uri"]["value"]
        if "repository_uri" in terraform_output
        else terraform_output["RepositoryUri"]["value"]
    )
    cluster_name = (
        terraform_output["cluster_name"]["value"]
        if "cluster_name" in terraform_output
        else terraform_output["ClusterName"]["value"]
    )

    service_account = Path("k8s/base/serviceaccount.yaml").read_text().replace(
        "REPLACE_WITH_TERRAFORM_OUTPUT_document_engine_irsa_role_arn", irsa_role_arn
    )
    deployment = Path("k8s/base/deployment.yaml").read_text().replace(
        "123456789012.dkr.ecr.ap-southeast-2.amazonaws.com/document-detection-engine:latest",
        f"{repository_uri}:latest",
    )

    (output_dir / "serviceaccount.yaml").write_text(service_account)
    (output_dir / "deployment.yaml").write_text(deployment)
    (output_dir / "cluster-name.txt").write_text(cluster_name + "\n")

    print(f"rendered manifests to {output_dir}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
