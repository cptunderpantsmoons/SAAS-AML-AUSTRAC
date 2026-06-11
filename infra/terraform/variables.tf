variable "aws_region" {
  description = "AWS region for deployment."
  type        = string
  default     = "ap-southeast-2"
}

variable "project_name" {
  description = "Project name prefix."
  type        = string
  default     = "aml-platform"
}

variable "cluster_name" {
  description = "EKS cluster name."
  type        = string
  default     = "aml-platform-syd"
}

variable "vpc_cidr" {
  description = "CIDR block for the VPC."
  type        = string
  default     = "10.20.0.0/16"
}

variable "public_subnet_cidrs" {
  description = "Public subnets."
  type        = list(string)
  default     = ["10.20.0.0/24", "10.20.1.0/24"]
}

variable "private_subnet_cidrs" {
  description = "Private subnets."
  type        = list(string)
  default     = ["10.20.10.0/24", "10.20.11.0/24"]
}

variable "sanitized_bucket_name" {
  description = "S3 bucket for sanitized documents."
  type        = string
  default     = "aml-au-documents-sanitized"
}

variable "k8s_namespace" {
  description = "Kubernetes namespace for the document detection engine."
  type        = string
  default     = "aml-platform"
}

variable "service_account_name" {
  description = "Kubernetes service account name used by the engine."
  type        = string
  default     = "document-detection-engine"
}

variable "node_desired_size" {
  description = "Desired EKS node count."
  type        = number
  default     = 2
}

variable "node_min_size" {
  description = "Minimum EKS node count."
  type        = number
  default     = 2
}

variable "node_max_size" {
  description = "Maximum EKS node count."
  type        = number
  default     = 4
}

variable "node_instance_types" {
  description = "EKS worker instance types."
  type        = list(string)
  default     = ["t3.medium"]
}

variable "neo4j_password" {
  description = "Neo4j database password (store in Secrets Manager for production)."
  type        = string
  default     = "changeme-neo4j-sprint3"
  sensitive   = true
}

variable "redis_node_type" {
  description = "ElastiCache Redis node type."
  type        = string
  default     = "cache.t3.micro"
}

variable "postgres_password" {
  description = "PostgreSQL RDS master password (store in Secrets Manager for production)."
  type        = string
  default     = "changeme-postgres-sprint4"
  sensitive   = true
}

variable "postgres_instance_class" {
  description = "RDS PostgreSQL instance class."
  type        = string
  default     = "db.t3.micro"
}
