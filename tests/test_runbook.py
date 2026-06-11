from __future__ import annotations

from pathlib import Path


def test_aws_sprint1_runbook_contains_the_main_deploy_steps():
    runbook = Path("docs/deployment/aws-sprint1-runbook.md").read_text()

    assert "terraform apply" in runbook
    assert "aws cloudformation deploy" in runbook
    assert "docker push" in runbook
    assert "aws eks update-kubeconfig" in runbook
    assert "kubectl apply -f k8s/base/" in runbook
    assert "api/v1/documents/analyze" in runbook
