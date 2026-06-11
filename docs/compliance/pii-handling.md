# PII Handling and Compliance Controls

## Scope

This service accepts uploaded documents that may contain personal information, identity data, and transaction artefacts relevant to AML/CTF workflows.

## Handling model

1. Uploaded content is processed in-memory for analysis.
2. Sanitization removes trailing whitespace payloads and preserves the original file name only after path normalization.
3. Sanitized artefacts are written to a dedicated storage tier, separated from operational logs.
4. The intended production storage control is Amazon S3 with SSE-KMS using a customer-managed KMS key in `ap-southeast-2`.
5. Access should be granted through short-lived pre-signed URLs only.

## Control mapping

### Privacy Act 1988 (Cth)

- Data minimisation: only the uploaded payload and derived detection findings are processed.
- Storage separation: sanitized objects are stored separately from application logs and metadata.
- Access control: production access is expected to use IAM least privilege and short-lived URLs.
- Retention discipline: bucket lifecycle and downstream retention policy should be aligned with the customer retention schedule.

### AUSTRAC Information Security Expectations

- Encryption at rest: S3 bucket policy requires SSE-KMS.
- Network segregation: EKS worker nodes run in private subnets inside a dedicated VPC.
- Auditability: each analysis returns an `analysis_id`, timestamps, module thresholds, and sanitization status.
- Defensive upload controls: content type allow-list, extension block-list, size limits, and file name normalization are enforced in the API layer.

## Operational notes

- Do not log raw document bodies.
- Do log analysis identifiers, module hits, storage object keys, and decision outcomes.
- Rotate the KMS key according to the organisation key management standard.
- Review detector confidence thresholds with the threat model before production rollout.
