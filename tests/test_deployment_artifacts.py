from __future__ import annotations

from pathlib import Path


def test_kubernetes_deployment_uses_dedicated_service_account():
    deployment = Path("k8s/base/deployment.yaml").read_text()

    assert "serviceAccountName: document-detection-engine" in deployment
    assert "document-detection-engine-sa" not in deployment


def test_kubernetes_service_account_manifest_exists():
    service_account = Path("k8s/base/serviceaccount.yaml")

    assert service_account.exists()
    contents = service_account.read_text()
    assert "eks.amazonaws.com/role-arn" in contents
    assert "document-detection-engine" in contents


def test_terraform_includes_irsa_and_bucket_policy_controls():
    terraform = Path("infra/terraform/main.tf").read_text()

    assert "aws_iam_role\" \"document_engine_irsa" in terraform
    assert "aws_iam_openid_connect_provider" in terraform
    assert "aws_s3_bucket_policy" in terraform
    assert "aws:SecureTransport" in terraform
    assert "aws:PrincipalArn" in terraform
