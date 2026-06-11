from __future__ import annotations

import argparse
import json
import subprocess
import sys
from pathlib import Path

if __package__ is None or __package__ == "":
    sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from scripts.render_sprint1_k8s import main as render_k8s_main


def _run(command: list[str], execute: bool) -> None:
    if not execute:
        print(" ".join(command))
        return
    subprocess.run(command, check=True)


def _write_terraform_output(terraform_output_path: Path, rendered_dir: Path) -> None:
    render_k8s_argv = [
        "scripts/render_sprint1_k8s.py",
        str(terraform_output_path),
        str(rendered_dir),
    ]
    previous_argv = sys.argv
    try:
        sys.argv = render_k8s_argv
        if render_k8s_main() != 0:
            raise SystemExit(1)
    finally:
        sys.argv = previous_argv


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Deploy Sprint 1 to AWS/EKS.")
    parser.add_argument("--terraform-output", required=True, help="Path to terraform output JSON.")
    parser.add_argument("--account-id", required=True, help="AWS account ID.")
    parser.add_argument(
        "--region",
        default="ap-southeast-2",
        help="AWS region for ECR and EKS commands.",
    )
    parser.add_argument(
        "--rendered-dir",
        default=".rendered/sprint1",
        help="Directory for rendered Kubernetes manifests.",
    )
    parser.add_argument(
        "--execute",
        action="store_true",
        help="Execute docker/aws/kubectl commands instead of printing them.",
    )
    return parser


def main() -> int:
    parser = build_parser()
    args = parser.parse_args()

    terraform_output_path = Path(args.terraform_output)
    rendered_dir = Path(args.rendered_dir)
    _write_terraform_output(terraform_output_path, rendered_dir)

    terraform_output = json.loads(terraform_output_path.read_text())
    repository_uri = terraform_output.get("repository_uri", terraform_output.get("RepositoryUri"))["value"]
    cluster_name = terraform_output.get("cluster_name", terraform_output.get("ClusterName"))["value"]
    irsa_role_arn = terraform_output["document_engine_irsa_role_arn"]["value"]

    print(f"rendered manifests: {rendered_dir}")
    print(f"cluster: {cluster_name}")
    print(f"irsa role: {irsa_role_arn}")

    commands = [
        [
            "aws",
            "eks",
            "update-kubeconfig",
            "--region",
            args.region,
            "--name",
            cluster_name,
        ],
        [
            "docker",
            "tag",
            "document-detection-engine:latest",
            f"{repository_uri}:latest",
        ],
        [
            "docker",
            "push",
            f"{repository_uri}:latest",
        ],
        [
            "kubectl",
            "apply",
            "-f",
            str(rendered_dir),
        ],
    ]

    for command in commands:
        _run(command, execute=args.execute)

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
