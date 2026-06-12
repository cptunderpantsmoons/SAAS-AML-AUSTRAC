# Sprint 7: Compliance Agent Infrastructure
# Deploys ECR repo, IRSA roles for compliance-agent and governance services.

# ── ECR Repository for Compliance Agent ──────────────────────────────────────

resource "aws_ecr_repository" "compliance_agent" {
  name                 = "${var.project_name}/compliance-agent"
  image_tag_mutability = "IMMUTABLE"
  image_scanning_configuration {
    scan_on_push = true
  }
  encryption_configuration {
    encryption_type = "KMS"
    kms_key         = aws_kms_key.documents.arn
  }

  tags = merge(local.tags, {
    Name = "${var.project_name}-compliance-agent"
  })
}

resource "aws_ecr_lifecycle_policy" "compliance_agent" {
  repository = aws_ecr_repository.compliance_agent.name
  policy = jsonencode({
    rules = [{
      rulePriority = 1
      description  = "Expire untagged images after 14 days"
      selection = {
        tagStatus   = "untagged"
        countType   = "sinceImagePushed"
        countUnit   = "days"
        countNumber = 14
      }
      action = { type = "expire" }
    }]
  })
}

# ── ECR Repository for Governance ────────────────────────────────────────────

resource "aws_ecr_repository" "governance" {
  name                 = "${var.project_name}/governance"
  image_tag_mutability = "IMMUTABLE"
  image_scanning_configuration {
    scan_on_push = true
  }
  encryption_configuration {
    encryption_type = "KMS"
    kms_key         = aws_kms_key.documents.arn
  }

  tags = merge(local.tags, {
    Name = "${var.project_name}-governance"
  })
}

resource "aws_ecr_lifecycle_policy" "governance" {
  repository = aws_ecr_repository.governance.name
  policy = jsonencode({
    rules = [{
      rulePriority = 1
      description  = "Expire untagged images after 14 days"
      selection = {
        tagStatus   = "untagged"
        countType   = "sinceImagePushed"
        countUnit   = "days"
        countNumber = 14
      }
      action = { type = "expire" }
    }]
  })
}

# ── IRSA for Compliance Agent ──────────────────────────────────────────────

resource "aws_iam_role" "compliance_agent_irsa" {
  name = "${var.project_name}-compliance-agent-irsa"
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect = "Allow"
      Action = "sts:AssumeRoleWithWebIdentity"
      Principal = {
        Federated = aws_iam_openid_connect_provider.eks.arn
      }
      Condition = {
        StringEquals = {
          "${replace(aws_eks_cluster.main.identity[0].oidc[0].issuer, "https://", "")}:aud" = "sts.amazonaws.com"
          "${replace(aws_eks_cluster.main.identity[0].oidc[0].issuer, "https://", "")}:sub" = "system:serviceaccount:${var.k8s_namespace}:compliance-agent"
        }
      }
    }]
  })

  tags = local.tags
}

resource "aws_iam_role_policy" "compliance_agent_irsa" {
  name = "${var.project_name}-compliance-agent-irsa"
  role = aws_iam_role.compliance_agent_irsa.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "secretsmanager:GetSecretValue",
          "secretsmanager:DescribeSecret"
        ]
        Resource = ["*"]
      },
      {
        Effect = "Allow"
        Action = [
          "kms:Decrypt",
          "kms:DescribeKey"
        ]
        Resource = [aws_kms_key.documents.arn]
      }
    ]
  })
}

# ── IRSA for Governance ──────────────────────────────────────────────────────

resource "aws_iam_role" "governance_irsa" {
  name = "${var.project_name}-governance-irsa"
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect = "Allow"
      Action = "sts:AssumeRoleWithWebIdentity"
      Principal = {
        Federated = aws_iam_openid_connect_provider.eks.arn
      }
      Condition = {
        StringEquals = {
          "${replace(aws_eks_cluster.main.identity[0].oidc[0].issuer, "https://", "")}:aud" = "sts.amazonaws.com"
          "${replace(aws_eks_cluster.main.identity[0].oidc[0].issuer, "https://", "")}:sub" = "system:serviceaccount:${var.k8s_namespace}:governance"
        }
      }
    }]
  })

  tags = local.tags
}

resource "aws_iam_role_policy" "governance_irsa" {
  name = "${var.project_name}-governance-irsa"
  role = aws_iam_role.governance_irsa.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "secretsmanager:GetSecretValue",
          "secretsmanager:DescribeSecret"
        ]
        Resource = ["*"]
      },
      {
        Effect = "Allow"
        Action = [
          "kms:Decrypt",
          "kms:DescribeKey"
        ]
        Resource = [aws_kms_key.documents.arn]
      }
    ]
  })
}
