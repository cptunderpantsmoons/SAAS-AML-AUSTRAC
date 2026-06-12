# Disaster Recovery Runbook -- AML Platform

## RTO / RPO Targets
- RTO: 4 hours
- RPO: 15 minutes (RDS automatic backups + S3 versioning)

## Scenario 1: EKS Cluster Failure
1. Verify VPC and RDS are healthy via AWS console.
2. Run `terraform plan` in `infra/terraform/` to validate state.
3. Re-apply EKS module: `terraform apply -target=module.eks`
4. Re-apply K8s manifests: `kubectl apply -k k8s/`
5. Verify pods: `kubectl get pods -n aml-platform`
6. Verify `/healthz` on all services.

## Scenario 2: RDS PostgreSQL Failure
1. Promote read replica: `aws rds promote-read-replica --db-instance-identifier aml-platform-rds-replica`
2. Update `POSTGRES_DSN` in K8s ConfigMap and restart pods.
3. Verify `governance/audit.py` connectivity via test log insertion.

## Scenario 3: AUSTRAC Gateway Unreachable
1. Check NAT Gateway EIP via `aws ec2 describe-addresses`.
2. Verify AUSTRAC mTLS cert in Secrets Manager.
3. Check SQS DLQ depth: `aws sqs get-queue-attributes`.
4. If DLQ > 100 messages, page on-call and execute incident response playbook.

## Scenario 4: Compliance Agent Failure
1. Check AgentMail.to inbox health via SDK status endpoint.
2. Verify `AGENTMAIL_API_KEY` in K8s secret `compliance-agent-secrets`.
3. Restart deployment: `kubectl rollout restart deployment/compliance-agent -n aml-platform`.
4. Verify websocket subscription reconnects in pod logs.
5. Verify `/healthz` and `/agent/chat` respond.

## Validation Checklist
- [ ] All pods Ready/Running
- [ ] `/healthz` returns 200 on all services
- [ ] `/agent/chat` returns 200 with valid SuperTokens session
- [ ] AgentMail websocket subscription active (check pod logs)
- [ ] RDS automated backup completed in last hour
- [ ] SQS DLQ depth < 10
