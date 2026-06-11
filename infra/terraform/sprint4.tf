# Sprint 4: PostgreSQL RDS with RLS for Transaction Monitoring

# ── Security Group for PostgreSQL ───────────────────────────────────────────

resource "aws_security_group" "postgres" {
  name        = "${var.project_name}-postgres-sg"
  description = "Security group for PostgreSQL RDS."
  vpc_id      = aws_vpc.main.id

  ingress {
    from_port   = 5432
    to_port     = 5432
    protocol    = "tcp"
    cidr_blocks = [var.vpc_cidr]
    description = "PostgreSQL from private VPC"
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = merge(local.tags, {
    Name = "${var.project_name}-postgres-sg"
  })
}

# ── DB Subnet Group ─────────────────────────────────────────────────────────

resource "aws_db_subnet_group" "aml" {
  name       = "${var.project_name}-db-subnet-group"
  subnet_ids = aws_subnet.private[*].id

  tags = merge(local.tags, {
    Name = "${var.project_name}-db-subnet-group"
  })
}

# ── RDS PostgreSQL Instance ───────────────────────────────────────────────────

resource "aws_db_instance" "transaction_monitoring" {
  identifier              = "${var.project_name}-tx-monitoring"
  engine                  = "postgres"
  engine_version          = "15.4"
  instance_class          = var.postgres_instance_class
  allocated_storage       = 100
  max_allocated_storage   = 500
  storage_type            = "gp3"
  storage_encrypted       = true
  kms_key_id              = aws_kms_key.ubo_graph.arn

  db_name  = "aml_transactions"
  username = "postgres"
  password = var.postgres_password

  multi_az                  = true
  publicly_accessible       = false
  vpc_security_group_ids    = [aws_security_group.postgres.id]
  db_subnet_group_name      = aws_db_subnet_group.aml.name

  backup_retention_period = 7
  backup_window           = "03:00-05:00"
  maintenance_window      = "Mon:05:00-Mon:07:00"
  deletion_protection     = true

  tags = merge(local.tags, {
    Name = "${var.project_name}-tx-monitoring"
  })
}

# ── PostgreSQL credentials in Secrets Manager ───────────────────────────────

resource "aws_secretsmanager_secret" "postgres_credentials" {
  name                    = "${var.project_name}/postgres-credentials"
  recovery_window_in_days = 7
  kms_key_id              = aws_kms_key.ubo_graph.arn

  tags = merge(local.tags, {
    Name = "${var.project_name}-postgres-credentials"
  })
}

resource "aws_secretsmanager_secret_version" "postgres_credentials" {
  secret_id = aws_secretsmanager_secret.postgres_credentials.id
  secret_string = jsonencode({
    username = "postgres"
    password = var.postgres_password
    host     = aws_db_instance.transaction_monitoring.address
    port     = 5432
    dsn      = "postgresql://postgres:${var.postgres_password}@${aws_db_instance.transaction_monitoring.address}:5432/aml_transactions"
  })
}

# ── IRSA for Transaction Monitoring Service ────────────────────────────────────

resource "aws_iam_role" "transaction_monitoring_irsa" {
  name = "${var.project_name}-transaction-monitoring-irsa"
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
          "${replace(aws_eks_cluster.main.identity[0].oidc[0].issuer, "https://", "")}:sub" = "system:serviceaccount:${var.k8s_namespace}:transaction-monitoring"
        }
      }
    }]
  })

  tags = local.tags
}

resource "aws_iam_role_policy" "transaction_monitoring_irsa" {
  name = "${var.project_name}-transaction-monitoring-irsa"
  role = aws_iam_role.transaction_monitoring_irsa.id
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
          aws_secretsmanager_secret.postgres_credentials.arn,
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
