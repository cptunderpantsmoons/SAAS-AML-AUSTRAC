from __future__ import annotations

from pathlib import Path


def test_terraform_declares_ecr_repository_for_engine_image():
    terraform = Path("infra/terraform/main.tf").read_text()

    assert "aws_ecr_repository" in terraform
    assert "document-detection-engine" in terraform
    assert "image_tag_mutability" in terraform
    assert "\"IMMUTABLE\"" in terraform


def test_terraform_enables_control_plane_logging():
    terraform = Path("infra/terraform/main.tf").read_text()

    assert "enabled_cluster_log_types" in terraform
    assert "\"api\"" in terraform
    assert "\"audit\"" in terraform
    assert "\"authenticator\"" in terraform


def test_terraform_defines_private_vpc_endpoints_for_dependencies():
    terraform = Path("infra/terraform/main.tf").read_text()

    assert "aws_vpc_endpoint" in terraform
    assert 'com.amazonaws.${var.aws_region}.s3' in terraform
    assert 'com.amazonaws.${var.aws_region}.ecr.api' in terraform
    assert 'com.amazonaws.${var.aws_region}.ecr.dkr' in terraform
    assert 'com.amazonaws.${var.aws_region}.logs' in terraform
    assert 'com.amazonaws.${var.aws_region}.kms' in terraform


def test_terraform_adds_s3_lifecycle_hardening():
    terraform = Path("infra/terraform/main.tf").read_text()

    assert "aws_s3_bucket_lifecycle_configuration" in terraform
    assert "noncurrent_version_expiration" in terraform
    assert "expiration" in terraform
