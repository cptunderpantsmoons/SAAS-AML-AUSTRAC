# Sprint 5: NAT Gateway, SQS DLQ, mTLS Secrets Manager, AUSTRAC Reporting Service IRSA

# NAT Gateway (Static Egress IP)
resource "aws_eip" "nat" {
  domain = "vpc"

  tags = merge(local.tags, {
    Name = "${var.project_name}-nat-eip"
  })
}

resource "aws_nat_gateway" "main" {
  allocation_id = aws_eip.nat.id
  subnet_id     = aws_subnet.public[0].id

  tags = merge(local.tags, {
    Name = "${var.project_name}-nat-gw"
  })
}

resource "aws_route" "private_nat" {
  route_table_id         = aws_route_table.private.id
  destination_cidr_block = "0.0.0.0/0"
  nat_gateway_id         = aws_nat_gateway.main.id
}

# SQS Dead Letter Queue
resource "aws_sqs_queue" "dlq" {
  name                       = "${var.project_name}-austrac-dlq"
  message_retention_seconds  = 1209600
  visibility_timeout_seconds = 300
  redrive_policy = jsonencode({
    deadLetterTargetArn = aws_sqs_queue.dlq_dead_letter.arn
    maxReceiveCount     = 5
  })

  tags = merge(local.tags, {
    Name = "${var.project_name}-austrac-dlq"
  })
}

resource "aws_sqs_queue" "dlq_dead_letter" {
  name                      = "${var.project_name}-austrac-dlq-dlq"
  message_retention_seconds = 1209600

  tags = merge(local.tags, {
    Name = "${var.project_name}-austrac-dlq-dlq"
  })
}

# Secrets Manager for mTLS Client Certificate
resource "aws_secretsmanager_secret" "austrac_mtls" {
  name                    = "${var.project_name}/austrac-mtls-cert"
  recovery_window_in_days = 7
  kms_key_id              = aws_kms_key.ubo_graph.arn

  tags = merge(local.tags, {
    Name = "${var.project_name}-austrac-mtls-cert"
  })
}

resource "aws_secretsmanager_secret_version" "austrac_mtls" {
  secret_id = aws_secretsmanager_secret.austrac_mtls.id
  secret_string = jsonencode({
    cert_pem = var.austrac_mtls_cert_pem
    key_pem  = var.austrac_mtls_key_pem
  })
}

# IRSA for AUSTRAC Reporting Service
resource "aws_iam_role" "austrac_reporting_irsa" {
  name = "${var.project_name}-austrac-reporting-irsa"
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
          "${replace(aws_eks_cluster.main.identity[0].oidc[0].issuer, "https://", "")}:sub" = "system:serviceaccount:${var.k8s_namespace}:austrac-reporting"
        }
      }
    }]
  })

  tags = local.tags
}

resource "aws_iam_role_policy" "austrac_reporting_irsa" {
  name = "${var.project_name}-austrac-reporting-irsa"
  role = aws_iam_role.austrac_reporting_irsa.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "secretsmanager:GetSecretValue",
          "secretsmanager:DescribeSecret"
        ]
        Resource = [
          aws_secretsmanager_secret.austrac_mtls.arn,
        ]
      },
      {
        Effect = "Allow"
        Action = [
          "sqs:SendMessage",
          "sqs:GetQueueUrl",
          "sqs:GetQueueAttributes"
        ]
        Resource = [
          aws_sqs_queue.dlq.arn,
          aws_sqs_queue.dlq_dead_letter.arn,
        ]
      },
      {
        Effect = "Allow"
        Action = [
          "kms:Decrypt",
          "kms:GenerateDataKey",
          "kms:DescribeKey"
        ]
        Resource = [aws_kms_key.ubo_graph.arn]
      }
    ]
  })
}
