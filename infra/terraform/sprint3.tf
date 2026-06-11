# Sprint 3: UBO Graph Database & Redis Cache Infrastructure
# Deploys Neo4j (on EKS) and ElastiCache Redis within the private VPC
# with encryption at rest and in transit.

# ── KMS key for Neo4j and Redis encryption ──────────────────────────────────

resource "aws_kms_key" "ubo_graph" {
  description             = "KMS key for UBO graph database and Redis encryption."
  deletion_window_in_days = 7
  enable_key_rotation     = true

  tags = merge(local.tags, {
    Name = "${var.project_name}-ubo-graph-kms"
  })
}

resource "aws_kms_alias" "ubo_graph" {
  name          = "alias/${var.project_name}-ubo-graph"
  target_key_id = aws_kms_key.ubo_graph.key_id
}

# ── Security Group for Neo4j ───────────────────────────────────────────────

resource "aws_security_group" "neo4j" {
  name        = "${var.project_name}-neo4j-sg"
  description = "Security group for Neo4j graph database."
  vpc_id      = aws_vpc.main.id

  ingress {
    from_port   = 7687
    to_port     = 7687
    protocol    = "tcp"
    cidr_blocks = [var.vpc_cidr]
    description = "Bolt protocol for Neo4j"
  }

  ingress {
    from_port   = 7474
    to_port     = 7474
    protocol    = "tcp"
    cidr_blocks = [var.vpc_cidr]
    description = "Neo4j HTTP"
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = merge(local.tags, {
    Name = "${var.project_name}-neo4j-sg"
  })
}

# ── Security Group for Redis ───────────────────────────────────────────────

resource "aws_security_group" "redis" {
  name        = "${var.project_name}-redis-sg"
  description = "Security group for ElastiCache Redis."
  vpc_id      = aws_vpc.main.id

  ingress {
    from_port   = 6379
    to_port     = 6379
    protocol    = "tcp"
    cidr_blocks = [var.vpc_cidr]
    description = "Redis protocol"
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = merge(local.tags, {
    Name = "${var.project_name}-redis-sg"
  })
}

# ── ElastiCache Subnet Group ───────────────────────────────────────────────

resource "aws_elasticache_subnet_group" "ubo" {
  name        = "${var.project_name}-ubo-cache"
  description = "Subnet group for UBO Redis cache."
  subnet_ids  = aws_subnet.private[*].id

  tags = local.tags
}

# ── ElastiCache Redis Replication Group ────────────────────────────────────

resource "aws_elasticache_replication_group" "ubo" {
  replication_group_id          = "${var.project_name}-ubo-redis"
  description                   = "Redis cache for UBO calculation results"
  engine                        = "redis"
  engine_version                = "7.1"
  node_type                     = var.redis_node_type
  number_cache_clusters         = 2
  subnet_group_name             = aws_elasticache_subnet_group.ubo.name
  security_group_ids            = [aws_security_group.redis.id]
  automatic_failover_enabled    = true
  multi_az_enabled              = true

  # Encryption at rest and in transit
  at_rest_encryption_enabled    = true
  transit_encryption_enabled    = true
  kms_key_id                    = aws_kms_key.ubo_graph.arn

  # Auth token for in-transit encryption
  auth_token                    = var.neo4j_password # reuse; in prod use separate secret

  snapshot_retention_limit      = 7
  snapshot_window               = "03:00-05:00"

  tags = merge(local.tags, {
    Name = "${var.project_name}-ubo-redis"
  })
}

# ── EFS for Neo4j persistent storage ───────────────────────────────────────

resource "aws_efs_file_system" "neo4j" {
  creation_token = "${var.project_name}-neo4j-data"
  encrypted      = true
  kms_key_id     = aws_kms_key.ubo_graph.arn

  lifecycle_policy {
    transition_to_ia = "AFTER_30_DAYS"
  }

  tags = merge(local.tags, {
    Name = "${var.project_name}-neo4j-data"
  })
}

resource "aws_efs_mount_target" "neo4j" {
  count           = length(aws_subnet.private)
  file_system_id  = aws_efs_file_system.neo4j.id
  subnet_id       = aws_subnet.private[count.index].id
  security_groups = [aws_security_group.neo4j.id]
}

# ── Neo4j credentials in Secrets Manager ───────────────────────────────────

resource "aws_secretsmanager_secret" "neo4j_credentials" {
  name                    = "${var.project_name}/neo4j-credentials"
  recovery_window_in_days = 7
  kms_key_id              = aws_kms_key.ubo_graph.arn

  tags = merge(local.tags, {
    Name = "${var.project_name}-neo4j-credentials"
  })
}

resource "aws_secretsmanager_secret_version" "neo4j_credentials" {
  secret_id = aws_secretsmanager_secret.neo4j_credentials.id
  secret_string = jsonencode({
    username = "neo4j"
    password = var.neo4j_password
    uri      = "bolt://${var.project_name}-neo4j.${var.aws_region}.elb.amazonaws.com:7687"
  })
}

# ── Redis connection string in Secrets Manager ─────────────────────────────

resource "aws_secretsmanager_secret" "redis_connection" {
  name                    = "${var.project_name}/redis-ubo-connection"
  recovery_window_in_days = 7
  kms_key_id              = aws_kms_key.ubo_graph.arn

  tags = merge(local.tags, {
    Name = "${var.project_name}-redis-ubo-connection"
  })
}

resource "aws_secretsmanager_secret_version" "redis_connection" {
  secret_id = aws_secretsmanager_secret.redis_connection.id
  secret_string = jsonencode({
    url       = "rediss://${aws_elasticache_replication_group.ubo.primary_endpoint_address}:6379/0"
    port      = 6379
    auth_token = var.neo4j_password # reuse; in prod use separate secret
  })
}

# ── IRSA for UBO Graph Service ─────────────────────────────────────────────

resource "aws_iam_role" "ubo_graph_irsa" {
  name = "${var.project_name}-ubo-graph-irsa"
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
          "${replace(aws_eks_cluster.main.identity[0].oidc[0].issuer, "https://", "")}:sub" = "system:serviceaccount:${var.k8s_namespace}:ubo-graph-service"
        }
      }
    }]
  })

  tags = local.tags
}

resource "aws_iam_role_policy" "ubo_graph_irsa" {
  name = "${var.project_name}-ubo-graph-irsa"
  role = aws_iam_role.ubo_graph_irsa.id
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
          aws_secretsmanager_secret.neo4j_credentials.arn,
          aws_secretsmanager_secret.redis_connection.arn,
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
