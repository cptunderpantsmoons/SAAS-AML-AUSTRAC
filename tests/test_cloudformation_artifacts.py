from __future__ import annotations

from pathlib import Path


def test_cloudformation_template_exists_and_targets_sydney():
    template = Path("infra/cloudformation/sprint1.yaml").read_text()

    assert "ap-southeast-2" in template
    assert "AWS::EKS::Cluster" in template
    assert "AWS::EC2::VPCEndpoint" in template
    assert "AWS::ECR::Repository" in template
    assert "AWS::S3::Bucket" in template
    assert "AWS::KMS::Key" in template
    assert "ClusterLogging" in template
    assert "LifecyclePolicyText" in template
