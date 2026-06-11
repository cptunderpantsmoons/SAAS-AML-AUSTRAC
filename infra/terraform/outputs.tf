output "vpc_id" {
  description = "VPC identifier."
  value       = aws_vpc.main.id
}

output "private_subnet_ids" {
  description = "Private subnet identifiers."
  value       = aws_subnet.private[*].id
}

output "cluster_name" {
  description = "EKS cluster name."
  value       = aws_eks_cluster.main.name
}

output "sanitized_bucket_name" {
  description = "Sanitized document bucket."
  value       = aws_s3_bucket.sanitized_documents.bucket
}

output "kms_key_arn" {
  description = "KMS key ARN for document encryption."
  value       = aws_kms_key.documents.arn
}

output "document_engine_irsa_role_arn" {
  description = "IAM role ARN for the document detection engine Kubernetes service account."
  value       = aws_iam_role.document_engine_irsa.arn
}

output "neo4j_secret_arn" {
  description = "ARN of the Neo4j credentials secret."
  value       = aws_secretsmanager_secret.neo4j_credentials.arn
}

output "redis_primary_endpoint" {
  description = "Primary endpoint for the UBO Redis cache."
  value       = aws_elasticache_replication_group.ubo.primary_endpoint_address
}

output "ubo_graph_irsa_role_arn" {
  description = "IAM role ARN for the UBO graph service Kubernetes service account."
  value       = aws_iam_role.ubo_graph_irsa.arn
}

output "nat_gateway_eip" {
  description = "Static egress IP for AUSTRAC whitelist."
  value       = aws_eip.nat.public_ip
}

output "austrac_dlq_url" {
  description = "SQS DLQ URL for AUSTRAC reporting failures."
  value       = aws_sqs_queue.dlq.url
}

output "austrac_reporting_irsa_role_arn" {
  description = "IRSA role ARN for the AUSTRAC reporting service."
  value       = aws_iam_role.austrac_reporting_irsa.arn
}
